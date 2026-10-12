import cds from "@sap/cds";
import "./srv/CsnRuntimeExtensions";

// @ts-ignore missing type
if (cds.add?.register) {
  // @ts-ignore missing type
  cds.add.register("data-inspector", require("./lib/add"));
}

// @ts-ignore missing type
if (cds.build?.register) {
  // @ts-ignore missing type
  cds.build.register("data-inspector", require("./lib/build"));
}
