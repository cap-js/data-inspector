sap.ui.define(["sap/ui/core/mvc/Controller"], (Controller) => {
  "use strict";

  return Controller.extend("sap.cap.datainspector.datainspectorui.controller.listview", {
    onInit: function () {
      this.oView = this.getView();
      this.oEntitiesTable = this.oView.byId("entitiesTable");
      this.oRouter = this.getOwnerComponent().getRouter();

      this.oEntitiesTable.attachUpdateFinished(this.onTableUpdateFinished, this); // Attach event handler for @odata.count update

      let oODataModel = this.getOwnerComponent().getModel("ODataModel");
      this.oView.setModel(oODataModel, "entityDefinition");

      this.oRouter.getRoute("entityDefinitionList").attachPatternMatched(this.onGoPress, this);
    },

    /**
     *
     * Handler for the Go button press event. Loads entitity line items based on the selected data source and entity name entered in the filter.
     * Also called on route matched and data source change.
     */
    onGoPress: function () {
      var sSelectedDatasourceKey = this.byId("dataSourceSelect").getSelectedKey();
      var sEntityName = this.byId("entityNameInput").getValue();
      var aFilters = [];

      // Clear previous selection
      this.oEntitiesTable.removeSelections();

      aFilters.push(new sap.ui.model.Filter("dataSource", "EQ", sSelectedDatasourceKey));

      if (sEntityName && sEntityName.length > 0) {
        aFilters.push(new sap.ui.model.Filter("name", "Contains", sEntityName));
      }

      // Make the oData request with filters
      this.oEntitiesTable.getBinding("items").filter(aFilters);
    },

    /**
     *
     * Event handler for table update finished event. Updates the title with the total count of entities.
     */
    onTableUpdateFinished: function (oEvent) {
      this.byId("ListViewTitle").setText("Entities (" + oEvent.getParameter("total") + ")");
    },

    /**
     *
     * Handler for the list item press event. It navigates to the column view for the selected entity.
     */
    onListItemPress: function (oEvent) {
      var oItem = oEvent.getParameter("listItem");
      var oContext = oItem.getBindingContext("entityDefinition");
      var Entity = oContext.getObject(),
        EntityName = Entity.name,
        oNextUIState;

      var oSelectedItem = oEvent.getSource();
      this.oEntitiesTable.setSelectedItem(oSelectedItem); // Highlight the selected item

      this.getOwnerComponent()
        .getHelper()
        .then(
          function (oHelper) {
            oNextUIState = oHelper.getNextUIState(1);
            this.oRouter.navTo("entityColumnList", {
              layout: oNextUIState.layout,
              name: EntityName,
            });
          }.bind(this)
        );
    },
  });
});
