import cds from "@sap/cds";

const log = cds.log("data-inspector");

cds.on("bootstrap", (app) => {
  try {
    // For running locally, serve the reuse UI5 app by mounting a static route
    // Not applicable for cloud deployments where HTML5 App Repository service of the consumer serves the UI5 app
    const profiles = cds.env.profiles || [];
    const isDevProfile = profiles.includes("development") || profiles.includes("dev");
    const isCloudEnv = !!(process.env.VCAP_APPLICATION || process.env.KUBERNETES_SERVICE_HOST);
    // Local only: require dev profile and not running in CF/Kyma
    if (!isDevProfile || isCloudEnv) {
      log.debug("bootstrapped");
      return;
    }

    if (!cds.env.production)
      app
        // @ts-ignore missing type for `serve`
        .serve("/data-inspector-ui")
        .from(__dirname, "/app/data-inspector-ui");

    log.debug("UI5 app served at static route /data-inspector-ui");
    log.debug("bootstrapped");
  } catch (e) {
    log.warn("Failed to create route for local static mount of UI5 app.", e.message);
    log.error("Reuse UI5 app cannot be served");
  }
});

// @ts-ignore missing type
cds.add?.register?.("data-inspector", require("./lib/add"));

// @ts-ignore missing type
cds.build?.register?.("data-inspector", require("./lib/build"));
