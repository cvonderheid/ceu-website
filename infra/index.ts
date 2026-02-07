import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import * as random from "@pulumi/random";

const config = new pulumi.Config();

const domainName = config.require("domainName");
const createHostedZone = config.getBoolean("createHostedZone") ?? true;
const existingHostedZoneId = config.get("existingHostedZoneId");
const authSubdomain = config.get("authSubdomain") ?? "auth";
const authDomainName = `${authSubdomain}.${domainName}`;

const dbName = config.get("dbName") ?? "ceuplanner";
const dbUsername = config.get("dbUsername") ?? "ceu_admin";
const dbInstanceClass = config.get("dbInstanceClass") ?? "db.t4g.micro";
const dbAllocatedStorage = config.getNumber("dbAllocatedStorage") ?? 20;

const apiImageTag = config.get("apiImageTag") ?? "latest";
const apiContainerPort = config.get("apiContainerPort") ?? "8000";
const deployApiService = config.getBoolean("deployApiService") ?? false;
const authCallbackUrls =
  config.getObject<string[]>("authCallbackUrls") ?? [`https://${domainName}/auth/callback`];
const authLogoutUrls = config.getObject<string[]>("authLogoutUrls") ?? [`https://${domainName}`];

if (!createHostedZone && !existingHostedZoneId) {
  throw new Error("Set existingHostedZoneId when createHostedZone=false.");
}

const stackName = pulumi.getStack();
const namePrefix = stackName.toLowerCase().replace(/[^a-z0-9-]/g, "-");
const awsRegion = aws.config.region || "us-east-1";
const usEast1 = new aws.Provider("usEast1", { region: "us-east-1" });

const hostedZoneLookup =
  createHostedZone || !existingHostedZoneId
    ? undefined
    : aws.route53.getZoneOutput({ zoneId: existingHostedZoneId });

const hostedZone = createHostedZone
  ? new aws.route53.Zone("primaryZone", {
      name: domainName,
      comment: `Managed by Pulumi stack ${pulumi.getStack()}`,
    })
  : undefined;

const hostedZoneId = createHostedZone ? hostedZone!.zoneId : pulumi.output(existingHostedZoneId!);
const hostedZoneNameServers = createHostedZone ? hostedZone!.nameServers : hostedZoneLookup!.nameServers;

const vpc = new aws.ec2.Vpc("appVpc", {
  cidrBlock: "10.0.0.0/16",
  enableDnsSupport: true,
  enableDnsHostnames: true,
  tags: {
    Name: `${namePrefix}-ceuplanner-vpc`,
  },
});

const availabilityZones = aws.getAvailabilityZonesOutput({ state: "available" });

const privateSubnets = ["10.0.1.0/24", "10.0.2.0/24"].map(
  (cidrBlock, index) =>
    new aws.ec2.Subnet(`privateSubnet${index + 1}`, {
      vpcId: vpc.id,
      cidrBlock,
      mapPublicIpOnLaunch: false,
      availabilityZone: availabilityZones.names.apply((names) => names[index]),
      tags: {
        Name: `${namePrefix}-ceuplanner-private-${index + 1}`,
      },
    })
);

const privateRouteTable = new aws.ec2.RouteTable("privateRouteTable", {
  vpcId: vpc.id,
  tags: {
    Name: `${namePrefix}-ceuplanner-private-rt`,
  },
});

privateSubnets.forEach((subnet, index) => {
  new aws.ec2.RouteTableAssociation(`privateRouteAssoc${index + 1}`, {
    routeTableId: privateRouteTable.id,
    subnetId: subnet.id,
  });
});

const appRunnerConnectorSg = new aws.ec2.SecurityGroup("appRunnerConnectorSg", {
  vpcId: vpc.id,
  description: "Egress for App Runner VPC connector",
  egress: [
    {
      fromPort: 0,
      toPort: 0,
      protocol: "-1",
      cidrBlocks: ["0.0.0.0/0"],
    },
  ],
  tags: {
    Name: `${namePrefix}-ceuplanner-apprunner-connector-sg`,
  },
});

const vpcEndpointSecurityGroup = new aws.ec2.SecurityGroup("vpcEndpointSecurityGroup", {
  vpcId: vpc.id,
  description: "HTTPS ingress from App Runner connector to interface endpoints",
  ingress: [
    {
      fromPort: 443,
      toPort: 443,
      protocol: "tcp",
      securityGroups: [appRunnerConnectorSg.id],
      description: "HTTPS from App Runner connector",
    },
  ],
  egress: [
    {
      fromPort: 0,
      toPort: 0,
      protocol: "-1",
      cidrBlocks: ["0.0.0.0/0"],
    },
  ],
  tags: {
    Name: `${namePrefix}-ceuplanner-vpce-sg`,
  },
});

new aws.ec2.VpcEndpoint("s3GatewayEndpoint", {
  vpcId: vpc.id,
  serviceName: `com.amazonaws.${awsRegion}.s3`,
  vpcEndpointType: "Gateway",
  routeTableIds: [privateRouteTable.id],
  tags: {
    Name: `${namePrefix}-ceuplanner-s3-vpce`,
  },
});

new aws.ec2.VpcEndpoint("cognitoIdpEndpoint", {
  vpcId: vpc.id,
  serviceName: `com.amazonaws.${awsRegion}.cognito-idp`,
  vpcEndpointType: "Interface",
  privateDnsEnabled: true,
  subnetIds: privateSubnets.map((subnet) => subnet.id),
  securityGroupIds: [vpcEndpointSecurityGroup.id],
  tags: {
    Name: `${namePrefix}-ceuplanner-cognito-vpce`,
  },
});

const dbSecurityGroup = new aws.ec2.SecurityGroup("dbSecurityGroup", {
  vpcId: vpc.id,
  description: "PostgreSQL access from App Runner",
  ingress: [
    {
      fromPort: 5432,
      toPort: 5432,
      protocol: "tcp",
      securityGroups: [appRunnerConnectorSg.id],
      description: "PostgreSQL from App Runner connector",
    },
  ],
  egress: [
    {
      fromPort: 0,
      toPort: 0,
      protocol: "-1",
      cidrBlocks: ["0.0.0.0/0"],
    },
  ],
  tags: {
    Name: `${namePrefix}-ceuplanner-db-sg`,
  },
});

const dbSubnetGroup = new aws.rds.SubnetGroup("dbSubnetGroup", {
  name: `${namePrefix}-ceuplanner-db-subnets`,
  subnetIds: privateSubnets.map((subnet) => subnet.id),
  tags: {
    Name: `${namePrefix}-ceuplanner-db-subnets`,
  },
});

const dbPassword = new random.RandomPassword("dbPassword", {
  length: 32,
  special: false,
});

const dbInstance = new aws.rds.Instance("postgres", {
  identifier: `${namePrefix}-ceuplanner-db`,
  engine: "postgres",
  instanceClass: dbInstanceClass,
  dbName,
  username: dbUsername,
  password: dbPassword.result,
  allocatedStorage: dbAllocatedStorage,
  maxAllocatedStorage: 100,
  storageType: "gp3",
  storageEncrypted: true,
  dbSubnetGroupName: dbSubnetGroup.name,
  vpcSecurityGroupIds: [dbSecurityGroup.id],
  publiclyAccessible: false,
  backupRetentionPeriod: 7,
  autoMinorVersionUpgrade: true,
  skipFinalSnapshot: false,
  finalSnapshotIdentifier: `${namePrefix}-ceuplanner-db-final`,
  deletionProtection: true,
  applyImmediately: true,
  tags: {
    Name: `${namePrefix}-ceuplanner-db`,
  },
});

const databaseUrlSecret = new aws.secretsmanager.Secret("databaseUrlSecret", {
  namePrefix: `${namePrefix}-ceuplanner-database-url-`,
  recoveryWindowInDays: 7,
  description: "DATABASE_URL for CEU Planner API",
});

const databaseUrl = pulumi.interpolate`postgresql+psycopg://${dbUsername}:${dbPassword.result}@${dbInstance.address}:${dbInstance.port}/${dbName}`;

new aws.secretsmanager.SecretVersion("databaseUrlSecretVersion", {
  secretId: databaseUrlSecret.id,
  secretString: databaseUrl,
});

const webBucket = new aws.s3.Bucket("webBucket", {
  bucket: domainName,
  forceDestroy: false,
  tags: {
    Name: `${namePrefix}-ceuplanner-web`,
  },
});

new aws.s3.BucketPublicAccessBlock("webBucketPublicAccessBlock", {
  bucket: webBucket.id,
  blockPublicAcls: true,
  blockPublicPolicy: true,
  ignorePublicAcls: true,
  restrictPublicBuckets: true,
});

new aws.s3.BucketOwnershipControls("webBucketOwnershipControls", {
  bucket: webBucket.id,
  rule: {
    objectOwnership: "BucketOwnerEnforced",
  },
});

const certificateBucket = new aws.s3.Bucket("certificateBucket", {
  bucket: `${domainName.replace(/\./g, "-")}-certs`,
  forceDestroy: false,
  tags: {
    Name: `${namePrefix}-ceuplanner-certs`,
  },
});

new aws.s3.BucketPublicAccessBlock("certificateBucketPublicAccessBlock", {
  bucket: certificateBucket.id,
  blockPublicAcls: true,
  blockPublicPolicy: true,
  ignorePublicAcls: true,
  restrictPublicBuckets: true,
});

new aws.s3.BucketOwnershipControls("certificateBucketOwnershipControls", {
  bucket: certificateBucket.id,
  rule: {
    objectOwnership: "BucketOwnerEnforced",
  },
});

const apiRepository = new aws.ecr.Repository("apiRepository", {
  name: `${namePrefix}-ceuplanner-api`,
  imageTagMutability: "MUTABLE",
  imageScanningConfiguration: {
    scanOnPush: true,
  },
  forceDelete: false,
});

new aws.ecr.LifecyclePolicy("apiRepositoryLifecyclePolicy", {
  repository: apiRepository.name,
  policy: JSON.stringify({
    rules: [
      {
        rulePriority: 1,
        description: "Retain last 30 images",
        selection: {
          tagStatus: "any",
          countType: "imageCountMoreThan",
          countNumber: 30,
        },
        action: {
          type: "expire",
        },
      },
    ],
  }),
});

const appRunnerEcrAccessRole = new aws.iam.Role("appRunnerEcrAccessRole", {
  name: `${namePrefix}-ceuplanner-apprunner-ecr-role`,
  assumeRolePolicy: aws.iam.assumeRolePolicyForPrincipal({
    Service: "build.apprunner.amazonaws.com",
  }),
});

new aws.iam.RolePolicyAttachment("appRunnerEcrAccessRoleAttachment", {
  role: appRunnerEcrAccessRole.name,
  policyArn: "arn:aws:iam::aws:policy/service-role/AWSAppRunnerServicePolicyForECRAccess",
});

const appRunnerInstanceRole = new aws.iam.Role("appRunnerInstanceRole", {
  name: `${namePrefix}-ceuplanner-apprunner-instance-role`,
  assumeRolePolicy: aws.iam.assumeRolePolicyForPrincipal({
    Service: "tasks.apprunner.amazonaws.com",
  }),
});

const appRunnerInstancePolicy = aws.iam.getPolicyDocumentOutput({
  statements: [
    {
      sid: "ReadDatabaseUrlSecret",
      effect: "Allow",
      actions: ["secretsmanager:GetSecretValue"],
      resources: [databaseUrlSecret.arn],
    },
    {
      sid: "ReadWriteCertificateBucket",
      effect: "Allow",
      actions: ["s3:ListBucket", "s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
      resources: [certificateBucket.arn, pulumi.interpolate`${certificateBucket.arn}/*`],
    },
  ],
});

new aws.iam.RolePolicy("appRunnerInstanceRolePolicy", {
  role: appRunnerInstanceRole.name,
  policy: appRunnerInstancePolicy.json,
});

const appRunnerVpcConnector = new aws.apprunner.VpcConnector("appRunnerVpcConnector", {
  vpcConnectorName: `${namePrefix}-ceuplanner-vpc-connector`,
  subnets: privateSubnets.map((subnet) => subnet.id),
  securityGroups: [appRunnerConnectorSg.id],
});

const userPool = new aws.cognito.UserPool("userPool", {
  name: `${namePrefix}-ceuplanner-users`,
  autoVerifiedAttributes: ["email"],
  usernameAttributes: ["email"],
  mfaConfiguration: "OFF",
  passwordPolicy: {
    minimumLength: 12,
    requireLowercase: true,
    requireUppercase: true,
    requireNumbers: true,
    requireSymbols: false,
    temporaryPasswordValidityDays: 7,
  },
  adminCreateUserConfig: {
    allowAdminCreateUserOnly: true,
  },
});

const userPoolClient = new aws.cognito.UserPoolClient("userPoolClient", {
  name: `${namePrefix}-ceuplanner-spa-client`,
  userPoolId: userPool.id,
  generateSecret: false,
  allowedOauthFlowsUserPoolClient: true,
  allowedOauthFlows: ["code"],
  allowedOauthScopes: ["openid", "email", "profile"],
  callbackUrls: authCallbackUrls,
  logoutUrls: authLogoutUrls,
  supportedIdentityProviders: ["COGNITO"],
  preventUserExistenceErrors: "ENABLED",
  accessTokenValidity: 60,
  idTokenValidity: 60,
  refreshTokenValidity: 30,
  tokenValidityUnits: {
    accessToken: "minutes",
    idToken: "minutes",
    refreshToken: "days",
  },
});

const authCertificate = new aws.acm.Certificate(
  "authCertificate",
  {
    domainName: authDomainName,
    validationMethod: "DNS",
  },
  { provider: usEast1 }
);

const authCertificateValidationRecords = authCertificate.domainValidationOptions.apply((options) =>
  options.map(
    (option, index) =>
      new aws.route53.Record(`authCertValidationRecord${index}`, {
        zoneId: hostedZoneId,
        name: option.resourceRecordName,
        type: option.resourceRecordType,
        records: [option.resourceRecordValue],
        ttl: 60,
        allowOverwrite: true,
      })
  )
);

const authCertificateValidation = new aws.acm.CertificateValidation(
  "authCertificateValidation",
  {
    certificateArn: authCertificate.arn,
    validationRecordFqdns: authCertificateValidationRecords.apply((records) =>
      records.map((record) => record.fqdn)
    ),
  },
  { provider: usEast1 }
);

let apiService: aws.apprunner.Service | undefined;
let apiOriginDomainName: pulumi.Input<string> | undefined;

if (deployApiService) {
  apiService = new aws.apprunner.Service("apiService", {
    serviceName: `${namePrefix}-ceuplanner-api`,
    sourceConfiguration: {
      autoDeploymentsEnabled: true,
      authenticationConfiguration: {
        accessRoleArn: appRunnerEcrAccessRole.arn,
      },
      imageRepository: {
        imageIdentifier: pulumi.interpolate`${apiRepository.repositoryUrl}:${apiImageTag}`,
        imageRepositoryType: "ECR",
        imageConfiguration: {
          port: apiContainerPort,
          runtimeEnvironmentSecrets: {
            DATABASE_URL: databaseUrlSecret.arn,
          },
          runtimeEnvironmentVariables: {
            CERT_STORAGE_BUCKET: certificateBucket.bucket,
            COGNITO_USER_POOL_ID: userPool.id,
            COGNITO_USER_POOL_CLIENT_ID: userPoolClient.id,
            COGNITO_REGION: awsRegion,
          },
        },
      },
    },
    instanceConfiguration: {
      cpu: "256",
      memory: "512",
      instanceRoleArn: appRunnerInstanceRole.arn,
    },
    healthCheckConfiguration: {
      protocol: "HTTP",
      path: "/healthz",
      interval: 10,
      timeout: 5,
      healthyThreshold: 1,
      unhealthyThreshold: 5,
    },
    networkConfiguration: {
      egressConfiguration: {
        egressType: "VPC",
        vpcConnectorArn: appRunnerVpcConnector.arn,
      },
    },
  });

  apiOriginDomainName = apiService.serviceUrl.apply((serviceUrl) => new URL(serviceUrl).hostname);
}

const apiOriginRequestPolicy = new aws.cloudfront.OriginRequestPolicy("apiOriginRequestPolicy", {
  name: `${namePrefix}-api-all-viewer-request-policy`,
  cookiesConfig: {
    cookieBehavior: "all",
  },
  headersConfig: {
    headerBehavior: "allExcept",
    headers: {
      items: ["Host"],
    },
  },
  queryStringsConfig: {
    queryStringBehavior: "all",
  },
});

const siteCertificate = new aws.acm.Certificate(
  "siteCertificate",
  {
    domainName,
    subjectAlternativeNames: [`www.${domainName}`],
    validationMethod: "DNS",
  },
  { provider: usEast1 }
);

const siteCertificateValidationRecords = siteCertificate.domainValidationOptions.apply((options) =>
  options.map(
    (option, index) =>
      new aws.route53.Record(`siteCertValidationRecord${index}`, {
        zoneId: hostedZoneId,
        name: option.resourceRecordName,
        type: option.resourceRecordType,
        records: [option.resourceRecordValue],
        ttl: 60,
        allowOverwrite: true,
      })
  )
);

const siteCertificateValidation = new aws.acm.CertificateValidation(
  "siteCertificateValidation",
  {
    certificateArn: siteCertificate.arn,
    validationRecordFqdns: siteCertificateValidationRecords.apply((records) =>
      records.map((record) => record.fqdn)
    ),
  },
  { provider: usEast1 }
);

const webOriginAccessControl = new aws.cloudfront.OriginAccessControl("webOriginAccessControl", {
  name: `${namePrefix}-ceuplanner-web-oac`,
  originAccessControlOriginType: "s3",
  signingBehavior: "always",
  signingProtocol: "sigv4",
});

const wwwRedirectFunction = new aws.cloudfront.Function("wwwRedirectFunction", {
  name: `${namePrefix}-www-to-apex`,
  runtime: "cloudfront-js-2.0",
  publish: true,
  code: `function toQueryString(querystring) {
  var pairs = [];
  for (var key in querystring) {
    if (!Object.prototype.hasOwnProperty.call(querystring, key)) {
      continue;
    }
    var entry = querystring[key];
    if (entry.multiValue) {
      for (var i = 0; i < entry.multiValue.length; i++) {
        var mv = entry.multiValue[i].value;
        pairs.push(encodeURIComponent(key) + (mv ? "=" + encodeURIComponent(mv) : ""));
      }
    } else {
      var value = entry.value;
      pairs.push(encodeURIComponent(key) + (value ? "=" + encodeURIComponent(value) : ""));
    }
  }
  return pairs.length ? "?" + pairs.join("&") : "";
}

function handler(event) {
  var request = event.request;
  var host = request.headers.host && request.headers.host.value ? request.headers.host.value.toLowerCase() : "";
  if (host === "www.${domainName}") {
    var query = toQueryString(request.querystring || {});
    return {
      statusCode: 301,
      statusDescription: "Moved Permanently",
      headers: {
        location: {
          value: "https://${domainName}" + request.uri + query
        }
      }
    };
  }
  return request;
}`,
});

const managedCachingOptimizedId = aws.cloudfront
  .getCachePolicy({ name: "Managed-CachingOptimized" })
  .then((policy) => {
    if (!policy.id) {
      throw new Error("Managed-CachingOptimized policy not found.");
    }
    return policy.id;
  });

const managedCachingDisabledId = aws.cloudfront
  .getCachePolicy({ name: "Managed-CachingDisabled" })
  .then((policy) => {
    if (!policy.id) {
      throw new Error("Managed-CachingDisabled policy not found.");
    }
    return policy.id;
  });

const distributionOrigins: aws.types.input.cloudfront.DistributionOrigin[] = [
  {
    originId: "web-s3-origin",
    domainName: webBucket.bucketRegionalDomainName,
    originAccessControlId: webOriginAccessControl.id,
  },
];

const orderedCacheBehaviors: aws.types.input.cloudfront.DistributionOrderedCacheBehavior[] = [];

if (deployApiService && apiOriginDomainName) {
  distributionOrigins.push({
    originId: "api-origin",
    domainName: apiOriginDomainName,
    customOriginConfig: {
      httpPort: 80,
      httpsPort: 443,
      originProtocolPolicy: "https-only",
      originSslProtocols: ["TLSv1.2"],
    },
  });

  orderedCacheBehaviors.push({
    pathPattern: "/api/*",
    targetOriginId: "api-origin",
    viewerProtocolPolicy: "redirect-to-https",
    allowedMethods: ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"],
    cachedMethods: ["GET", "HEAD", "OPTIONS"],
    compress: true,
    cachePolicyId: managedCachingDisabledId,
    originRequestPolicyId: apiOriginRequestPolicy.id,
  });
}

const webDistribution = new aws.cloudfront.Distribution("webDistribution", {
  enabled: true,
  isIpv6Enabled: true,
  aliases: [domainName, `www.${domainName}`],
  defaultRootObject: "index.html",
  origins: distributionOrigins,
  defaultCacheBehavior: {
    targetOriginId: "web-s3-origin",
    viewerProtocolPolicy: "redirect-to-https",
    allowedMethods: ["GET", "HEAD", "OPTIONS"],
    cachedMethods: ["GET", "HEAD", "OPTIONS"],
    compress: true,
    cachePolicyId: managedCachingOptimizedId,
    functionAssociations: [
      {
        eventType: "viewer-request",
        functionArn: wwwRedirectFunction.arn,
      },
    ],
  },
  orderedCacheBehaviors,
  customErrorResponses: [
    {
      errorCode: 403,
      responseCode: 200,
      responsePagePath: "/index.html",
    },
    {
      errorCode: 404,
      responseCode: 200,
      responsePagePath: "/index.html",
    },
  ],
  restrictions: {
    geoRestriction: {
      restrictionType: "none",
    },
  },
  viewerCertificate: {
    acmCertificateArn: siteCertificateValidation.certificateArn,
    sslSupportMethod: "sni-only",
    minimumProtocolVersion: "TLSv1.2_2021",
  },
  priceClass: "PriceClass_100",
});

const webBucketPolicyDoc = aws.iam.getPolicyDocumentOutput({
  statements: [
    {
      sid: "AllowCloudFrontReadOnly",
      effect: "Allow",
      actions: ["s3:GetObject"],
      resources: [pulumi.interpolate`${webBucket.arn}/*`],
      principals: [
        {
          type: "Service",
          identifiers: ["cloudfront.amazonaws.com"],
        },
      ],
      conditions: [
        {
          test: "StringEquals",
          variable: "AWS:SourceArn",
          values: [webDistribution.arn],
        },
      ],
    },
  ],
});

new aws.s3.BucketPolicy("webBucketPolicy", {
  bucket: webBucket.id,
  policy: webBucketPolicyDoc.json,
});

const apexAliasA = new aws.route53.Record("apexAliasA", {
  zoneId: hostedZoneId,
  name: domainName,
  type: "A",
  aliases: [
    {
      name: webDistribution.domainName,
      zoneId: webDistribution.hostedZoneId,
      evaluateTargetHealth: false,
    },
  ],
});

new aws.route53.Record("apexAliasAAAA", {
  zoneId: hostedZoneId,
  name: domainName,
  type: "AAAA",
  aliases: [
    {
      name: webDistribution.domainName,
      zoneId: webDistribution.hostedZoneId,
      evaluateTargetHealth: false,
    },
  ],
});

new aws.route53.Record("wwwAliasA", {
  zoneId: hostedZoneId,
  name: `www.${domainName}`,
  type: "A",
  aliases: [
    {
      name: webDistribution.domainName,
      zoneId: webDistribution.hostedZoneId,
      evaluateTargetHealth: false,
    },
  ],
});

new aws.route53.Record("wwwAliasAAAA", {
  zoneId: hostedZoneId,
  name: `www.${domainName}`,
  type: "AAAA",
  aliases: [
    {
      name: webDistribution.domainName,
      zoneId: webDistribution.hostedZoneId,
      evaluateTargetHealth: false,
    },
  ],
});

const userPoolDomain = new aws.cognito.UserPoolDomain(
  "userPoolDomain",
  {
    domain: authDomainName,
    userPoolId: userPool.id,
    certificateArn: authCertificateValidation.certificateArn,
  },
  {
    // Cognito custom domain validation requires the parent domain apex A record to resolve.
    dependsOn: [apexAliasA],
  }
);

new aws.route53.Record("authDomainAliasA", {
  zoneId: hostedZoneId,
  name: authDomainName,
  type: "A",
  aliases: [
    {
      name: userPoolDomain.cloudfrontDistribution,
      zoneId: "Z2FDTNDATAQYW2",
      evaluateTargetHealth: false,
    },
  ],
});

new aws.route53.Record("authDomainAliasAAAA", {
  zoneId: hostedZoneId,
  name: authDomainName,
  type: "AAAA",
  aliases: [
    {
      name: userPoolDomain.cloudfrontDistribution,
      zoneId: "Z2FDTNDATAQYW2",
      evaluateTargetHealth: false,
    },
  ],
});

export const region = aws.config.region;
export const hostedZoneIdOutput = hostedZoneId;
export const hostedZoneNameServersOutput = hostedZoneNameServers;
export const websiteBucketName = webBucket.bucket;
export const certificateBucketName = certificateBucket.bucket;
export const apiRepositoryUrl = apiRepository.repositoryUrl;
export const apiServiceUrl = apiService ? apiService.serviceUrl : "not-deployed";
export const distributionId = webDistribution.id;
export const distributionDomainName = webDistribution.domainName;
export const appUrl = pulumi.interpolate`https://${domainName}`;
export const authUrl = pulumi.interpolate`https://${authDomainName}`;
export const cognitoUserPoolId = userPool.id;
export const cognitoUserPoolClientId = userPoolClient.id;
export const databaseEndpoint = dbInstance.address;
export const databaseUrlSecretArn = databaseUrlSecret.arn;
