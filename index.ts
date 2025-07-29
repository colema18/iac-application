import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";
import ServiceDeployment from "./component-resources/service-deployment";

const region = new pulumi.Config("aws").require("region");
const environmentName = new pulumi.Config().require("environmentName");

const appConfig = new pulumi.Config("iac-app-config");
const applicationName = appConfig.require("applicationName");
const profileName = appConfig.require("profileName");

const config = new pulumi.Config();
const helloPulumiUiImageTag = config.require("helloPulumiUiImageTag");
const helloPulumiAppImageTag = config.require("helloPulumiAppImageTag");

// Reference outputs from the infra stack
const infraStack = new pulumi.StackReference("coleman/iac-infra/dev");

const provider = new k8s.Provider("k8s-provider", {
  kubeconfig: infraStack.requireOutput("kubeconfigOut"),
});
const appConfigRoleArn = infraStack.getOutput("appConfigRoleArn");

// ------------------------
// Create Service Account with IRSA Role
// ------------------------
const serviceAccount = new k8s.core.v1.ServiceAccount("hello-pulumi-app-sa", {
    metadata: {
        name: "hello-pulumi-app-sa",
        annotations: {
            "eks.amazonaws.com/role-arn": appConfigRoleArn,
        },
    },
}, { provider });

// ------------------------
// Backend
// ------------------------
const backend = new ServiceDeployment("backend", {
    provider,
    labels: { app: "backend" },
    replicas: 2,
    image: `ghcr.io/colema18/hello-pulumi-app:${helloPulumiAppImageTag}`,
    containerPort: 5050,
    servicePort: 5050,
    serviceAccountName: serviceAccount.metadata.name,
    env: [
    { name: "AWS_REGION", value: region },
    { name: "AWS_APPCONFIG_APPLICATION", value: applicationName },
    { name: "AWS_APPCONFIG_ENVIRONMENT", value: environmentName },
    { name: "AWS_APPCONFIG_PROFILE", value: profileName },
    { name: "DEFAULT_MESSAGE", value: "fallback-value" }
  ],
});

export const backEndUrl = backend.url;

// ------------------------
// Frontend (depends on backend URL)
// ------------------------
const apiUrl = backend.url.apply(url => url.replace(/:\d+$/, ":5050"));

const frontend = new ServiceDeployment("frontend", {
  provider,
  labels: { app: "frontend" },
  replicas: 2,
  image: `ghcr.io/colema18/hello-pulumi-ui:${helloPulumiUiImageTag}`,
  containerPort: 80,
  servicePort: 80,
  dependsOn: [backend.service],
  serviceAccountName: serviceAccount.metadata.name,

  env: [
    { name: "API_URL", value: apiUrl },
    { name: "AWS_REGION", value: region },
    { name: "AWS_APPCONFIG_APPLICATION", value: applicationName },
    { name: "AWS_APPCONFIG_ENVIRONMENT", value: environmentName },
    { name: "AWS_APPCONFIG_PROFILE", value: profileName },
    { name: "DEFAULT_MESSAGE", value: "fallback-value" },
  ],
});

pulumi.log.info(`UI Image Tag: ${helloPulumiUiImageTag}`);
pulumi.log.info(`App Image Tag: ${helloPulumiAppImageTag}`);

export const uiImageTag = helloPulumiUiImageTag;
export const appImageTag = helloPulumiAppImageTag;
export const frontEndUrl = frontend.url;
