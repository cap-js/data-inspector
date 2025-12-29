sap.ui.define([
    "sap/ui/core/mvc/Controller"
], (Controller) =>{
    "use strict";

    return Controller.extend("sap.cap.datainspector.datainspectorui.controller.listview", {
        onInit: function () {
			this.oView = this.getView();
			this.oEntitiesTable = this.oView.byId("entitiesTable");
            this.oRouter = this.getOwnerComponent().getRouter();

			this.oEntitiesTable.attachUpdateFinished(this.onTableUpdateFinished, this);	// Attach event handler for @odata.count update
			
			let oODataModel = this.getOwnerComponent().getModel("ODataModel");
			this.oView.setModel(oODataModel, "entityDefinition");

			this.oRouter.getRoute("entityDefinitionList").attachPatternMatched(this.onRouteMatched, this);
		},

		/**
		 * 
		 * Event handler for route matched event. Sets the layout to 'OneColumn' when navigating to the list view and calls the onGoPress method to load the Entity List.
		 */
		onRouteMatched: function () {
        		this.onGoPress();
		},

		/**
		 * 
		 * Handler for the Go button press event. Loads entitity line items based on the selected data source and entity name entered in the filter.
		 */
		onGoPress: function() {
			var sSelectedDatasourceKey = this.byId("dataSourceSelect").getSelectedKey();
			var sEntityName = this.byId("entityNameInput").getValue();
			var aFilters = []; 

			// Clear previous selection
			this.oEntitiesTable.removeSelections();
			// Unbind previous items
			this.oEntitiesTable.unbindItems();

			aFilters.push(new sap.ui.model.Filter("dataSource", "EQ", sSelectedDatasourceKey));

			if(sEntityName && sEntityName.length > 0) {
				aFilters.push(new sap.ui.model.Filter("name", "Contains", sEntityName));
			}

			// Bind table items using OData V4 model
			this.oEntitiesTable.bindItems({
				path: "entityDefinition>/EntityDefinition",
				parameters: {
					$count: true,
					$select: "name,title"
				},
				template: new sap.m.ColumnListItem({
					type: "Navigation",
					cells: [
						new sap.m.ObjectIdentifier({
							title: "{entityDefinition>name}",
							text: "{entityDefinition>title}"
						})
					]
				}),
				filters: aFilters
			});
		},

		/**
		 * 
		 * Event handler for table update finished event. Updates the title with the total count of entities.
		 */
		onTableUpdateFinished: function(oEvent) {
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

			this.getOwnerComponent().getHelper().then(function (oHelper) {
				oNextUIState = oHelper.getNextUIState(1);
				this.oRouter.navTo("entityColumnList", {
					layout: oNextUIState.layout,
					name: EntityName
				});
			}.bind(this));
		},

	});
});
