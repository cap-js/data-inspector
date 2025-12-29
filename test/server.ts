import cds from "@sap/cds";

cds.once("bootstrap", (app) => {
  app
    // @ts-ignore missing type for `serve`
    .serve("/data-inspector-ui")
    .from(__dirname, "../app/data-inspector-ui/webapp"); // This is needed to point to the correct folder in tests
});
