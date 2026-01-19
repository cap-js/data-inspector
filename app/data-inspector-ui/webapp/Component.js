sap.ui.define([
    "sap/ui/core/UIComponent",
    "sap/ui/model/json/JSONModel",
    "sap/f/FlexibleColumnLayoutSemanticHelper",
	"sap/f/library"
], (UIComponent, JSONModel, FlexibleColumnLayoutSemanticHelper, fioriLibrary) => {
    "use strict";

    return UIComponent.extend("sap.cap.datainspector.datainspectorui.Component", {
        metadata: {
            manifest: "json",
            interfaces: [
                "sap.ui.core.IAsyncContentCreation"
            ]
        },

        init: function () {

            var oModel,
                oRouter;

            UIComponent.prototype.init.apply(this, arguments);

            // set initial data model to be used by the FCL
            oModel = new JSONModel();
            this.setModel(oModel);

            oRouter = this.getRouter();
            oRouter.attachBeforeRouteMatched(this._onBeforeRouteMatched, this);
            oRouter.initialize();

            // Redirect to first page column when web browser is refreshed
            oRouter.navTo("entityDefinitionList",{
                layout: "OneColumn"
            },true);
            this.getModel().setProperty("/layout", "OneColumn");

        },

        /**
         * 
         * _onBeforeRouteMatched is a routing event handler which sets the layout property in the model
         * to either the layout provided in the route or the default layout (OneColumn) if no layout is provided.
         * This ensures that the FlexibleColumnLayout control displays the correct number of columns based on the navigation.
         */
        _onBeforeRouteMatched: function(oEvent) {
            var oModel = this.getModel(),
                sLayout = oEvent.getParameters().arguments.layout,
                oNextUIState;

            // if there is no layout parameter, query for the default level 0 layout (normally OneColumn)
            if (!sLayout) {
                this.getHelper().then(function (oHelper) {
                    oNextUIState = oHelper.getNextUIState(0);
                    oModel.setProperty("/layout", oNextUIState.layout);
                });
                return;
            }
            oModel.setProperty("/layout",sLayout);
        },

        /**
        * Helper for the FlexibleColumnLayout control, which helps the application
        * to manage multi-column layouts and navigation between columns.
        */
        getHelper: function () {

            return this._getFcl().then(function (oFCL) {
                var oSettings = {
                    defaultTwoColumnLayoutType: fioriLibrary.LayoutType.TwoColumnsMidExpanded,
                    defaultThreeColumnLayoutType: fioriLibrary.LayoutType.ThreeColumnsMidExpanded
                };
                return (FlexibleColumnLayoutSemanticHelper.getInstanceFor(oFCL, oSettings));

            });
        },

        /**
         * async utility to get application's 'flexibleColumnLayout' control, 
         * to cover cases where root control is already initialized, is initializing, or not yet created.
         */
        _getFcl: function () {
            return new Promise(function(resolve, reject) {
                var oRoot = this.getRootControl();
                var oFCL = oRoot && oRoot.byId('flexibleColumnLayout');
                if (oFCL) {
                    resolve(oFCL);
                } else if (oRoot) {
                    oRoot.attachAfterInit(function(oEvent) {
                        resolve(oEvent.getSource().byId('flexibleColumnLayout'));
                    }, this);
                } else {
                    // Wait for root control to be created
                    this.attachEventOnce("rootControlCreated", function() {
                        var oRoot = this.getRootControl();
                        var oFCL = oRoot && oRoot.byId('flexibleColumnLayout');
                        if (oFCL) {
                            resolve(oFCL);
                        } else {
                            reject("flexibleColumnLayout not found after rootControlCreated");
                        }
                    }, this);
                }
            }.bind(this));
        }
    });
});