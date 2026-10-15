import { randomBytes } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as apigw from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as budgets from 'aws-cdk-lib/aws-budgets';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { SqsEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import { NodejsFunction, OutputFormat } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as sqs from 'aws-cdk-lib/aws-sqs';

/**
 * Prompt Quest — arquitectura 100 % serverless y de pago por uso.
 *
 *  Móvil / Pantalla ──► CloudFront ─┬─► S3 (web estática)
 *                                   ├─► S3 (replays inmutables, caché 1 año)
 *                                   └─► API Gateway HTTP ──► Lambda api ──► DynamoDB
 *                                                               │
 *                                                               └─► SQS ──► Lambda compile ──► Bedrock (Claude)
 *  EventBridge (1/min) ──► Lambda tick ──► motor de juego (ms) ──► S3 replay + DynamoDB + Bedrock (crónica)
 */
const __dirname = dirname(fileURLToPath(import.meta.url));

class PromptQuestStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: cdk.StackProps) {
    super(scope, id, props);
    const ctx = (k: string, d?: string) => (this.node.tryGetContext(k) as string | undefined) ?? process.env[k.toUpperCase()] ?? d;
    const adminKey = ctx('adminKey') ?? randomBytes(9).toString('base64url');
    const modelId = ctx('modelId', 'anthropic.claude-haiku-5-5')!;
    const bedrockRegion = ctx('bedrockRegion', this.region)!;
    const alertEmail = ctx('alertEmail');
    const monthlyBudgetUsd = Number(ctx('budgetUsd', '20'));

    // ---------------------------------------------------------------- datos
    const table = new dynamodb.Table(this, 'Table', {
      partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'sk', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    table.addGlobalSecondaryIndex({
      indexName: 'byType',
      partitionKey: { name: 'type', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'createdAt', type: dynamodb.AttributeType.NUMBER },
    });

    const webBucket = new s3.Bucket(this, 'Web', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL, enforceSSL: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY, autoDeleteObjects: true,
    });
    const dataBucket = new s3.Bucket(this, 'Data', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL, enforceSSL: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY, autoDeleteObjects: true,
      lifecycleRules: [{ prefix: 'replays/', expiration: cdk.Duration.days(30) }],
    });

    // ---------------------------------------------------------------- cola de compilación (protege la cuota de Bedrock)
    const dlq = new sqs.Queue(this, 'CompileDLQ', { retentionPeriod: cdk.Duration.days(4) });
    const queue = new sqs.Queue(this, 'CompileQueue', {
      visibilityTimeout: cdk.Duration.seconds(90),
      deadLetterQueue: { queue: dlq, maxReceiveCount: 3 },
    });

    // ---------------------------------------------------------------- funciones
    const common = {
      entry: join(__dirname, '..', 'src', 'lambda', 'handlers.ts'),
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      bundling: { minify: true, format: OutputFormat.CJS, target: 'node22', externalModules: ['@aws-sdk/*'] },
      environment: {
        TABLE: table.tableName,
        DATA_BUCKET: dataBucket.bucketName,
        QUEUE_URL: queue.queueUrl,
        ADMIN_KEY: adminKey,
        MODEL_ID: modelId,
        BEDROCK_REGION: bedrockRegion,
        COMPILER: ctx('compiler', 'bedrock')!,
        NARRATION: ctx('narration', 'bedrock')!,
      },
    };
    const logGroup = (id: string) => new logs.LogGroup(this, id, { retention: logs.RetentionDays.ONE_WEEK, removalPolicy: cdk.RemovalPolicy.DESTROY });
    const apiFn = new NodejsFunction(this, 'ApiFn', { ...common, logGroup: logGroup('ApiLogs'), handler: 'api', memorySize: 512, timeout: cdk.Duration.seconds(15) });
    const compileFn = new NodejsFunction(this, 'CompileFn', { ...common, logGroup: logGroup('CompileLogs'), handler: 'compile', memorySize: 256, timeout: cdk.Duration.seconds(60) });
    const tickFn = new NodejsFunction(this, 'TickFn', { ...common, logGroup: logGroup('TickLogs'), handler: 'tick', memorySize: 512, timeout: cdk.Duration.seconds(70) });

    table.grantReadWriteData(apiFn);
    table.grantReadWriteData(compileFn);
    table.grantReadWriteData(tickFn);
    queue.grantSendMessages(apiFn);
    dataBucket.grantPut(apiFn);
    dataBucket.grantPut(tickFn);
    const bedrock = new iam.PolicyStatement({
      actions: ['bedrock:InvokeModel'],
      resources: ['arn:aws:bedrock:*::foundation-model/anthropic.*', `arn:aws:bedrock:*:${this.account}:inference-profile/*`],
    });
    compileFn.addToRolePolicy(bedrock);
    tickFn.addToRolePolicy(bedrock);
    apiFn.addToRolePolicy(bedrock); // la partida lanzada desde la pantalla del stand genera la crónica

    // como mucho 5 compilaciones simultáneas: backpressure ante picos de registros
    compileFn.addEventSource(new SqsEventSource(queue, { batchSize: 1, maxConcurrency: 5, reportBatchItemFailures: true }));

    // latido de 1 minuto; si el modo automático está apagado, la función termina en milisegundos
    new events.Rule(this, 'Tick', { schedule: events.Schedule.rate(cdk.Duration.minutes(1)), targets: [new targets.LambdaFunction(tickFn)] });

    // ---------------------------------------------------------------- API
    const httpApi = new apigw.HttpApi(this, 'Api', {
      defaultIntegration: new HttpLambdaIntegration('ApiInt', apiFn),
    });
    const stage = httpApi.defaultStage!.node.defaultChild as apigw.CfnStage;
    stage.defaultRouteSettings = { throttlingRateLimit: 50, throttlingBurstLimit: 100 };

    // ---------------------------------------------------------------- CDN
    const apiCache = new cloudfront.CachePolicy(this, 'ApiCache', {
      comment: 'Respeta Cache-Control del origen (/api/arena = 2 s): miles de espectadores, una lectura cada 2 s',
      defaultTtl: cdk.Duration.seconds(0), minTtl: cdk.Duration.seconds(0), maxTtl: cdk.Duration.seconds(60),
      queryStringBehavior: cloudfront.CacheQueryStringBehavior.all(),
      enableAcceptEncodingGzip: true, enableAcceptEncodingBrotli: true,
    });
    const dist = new cloudfront.Distribution(this, 'Cdn', {
      defaultRootObject: 'index.html',
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(webBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        compress: true,
      },
      additionalBehaviors: {
        '/api/*': {
          origin: new origins.HttpOrigin(cdk.Fn.select(2, cdk.Fn.split('/', httpApi.apiEndpoint))),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.HTTPS_ONLY,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          cachePolicy: apiCache,
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        },
        '/replays/*': {
          origin: origins.S3BucketOrigin.withOriginAccessControl(dataBucket),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        },
      },
    });

    new s3deploy.BucketDeployment(this, 'DeployWeb', {
      sources: [s3deploy.Source.asset(join(__dirname, '..', 'dist', 'web'))],
      destinationBucket: webBucket,
      distribution: dist,
      distributionPaths: ['/*'],
    });

    // ---------------------------------------------------------------- control de gasto
    if (alertEmail) {
      new budgets.CfnBudget(this, 'Budget', {
        budget: { budgetName: 'prompt-quest', budgetType: 'COST', timeUnit: 'MONTHLY', budgetLimit: { amount: monthlyBudgetUsd, unit: 'USD' } },
        notificationsWithSubscribers: [50, 80, 100].map((threshold) => ({
          notification: { notificationType: 'ACTUAL', comparisonOperator: 'GREATER_THAN', threshold, thresholdType: 'PERCENTAGE' },
          subscribers: [{ subscriptionType: 'EMAIL', address: alertEmail }],
        })),
      });
    }

    new cdk.CfnOutput(this, 'Url', { value: `https://${dist.distributionDomainName}` });
    new cdk.CfnOutput(this, 'StandScreen', { value: `https://${dist.distributionDomainName}/#/arena?admin` });
    new cdk.CfnOutput(this, 'AdminKey', { value: adminKey });
    new cdk.CfnOutput(this, 'Model', { value: `${modelId} @ ${bedrockRegion}` });
  }
}

const app = new cdk.App();
new PromptQuestStack(app, 'PromptQuest', {
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION ?? 'eu-west-1' },
  description: 'Prompt Quest: Agent Arena (prototipo serverless)',
});
cdk.Tags.of(app).add('project', 'prompt-quest');
