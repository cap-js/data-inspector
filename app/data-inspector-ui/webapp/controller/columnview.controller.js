sap.ui.define([
	"sap/ui/core/mvc/Controller",
	"sap/ui/model/Filter",
	"sap/ui/model/FilterOperator",
	"sap/ui/model/Sorter",
	"sap/ui/model/json/JSONModel"
], function (Controller, Filter, FilterOperator, Sorter, JSONModel) {
	"use strict";

	return Controller.extend("sap.cap.datainspector.datainspectorui.controller.columnview", {
        onInit: function () {
			this.oRouter = this.getOwnerComponent().getRouter();
			this.oModel = this.getOwnerComponent().getModel();
			this.oRouter.getRoute("entityColumnList").attachPatternMatched(this.onRouteMatched, this);
			this.oODataModel = this.getOwnerComponent().getModel("ODataModel");
		},

		//----------------------------------On Page load---------------------------------------------------------------------
		onRouteMatched: function (oEvent) {
			this._name = oEvent.getParameter("arguments").name || this._name || "0";
			this._loadODataProduct(this._name);

			// Setting the name in a view model for easy binding in the view
			var oViewModel = this.getView().getModel("view") || new JSONModel();
			oViewModel.setProperty("/name", this._name);

			//Clear the structure rows selection if entity name selected is changed
			if(!this._previousEntityName || this._previousEntityName !== this._name) {
				this.getOwnerComponent()._aSelectedColumnKeys = [];
				this._previousEntityName = this._name;
				this._isNavigatingFromEntityList = true;// Flag to indicate navigation from entity list
			} else {
				this._isNavigatingFromEntityList = false;
			}
			// Enable/disable the Show Data button initially based on existing selection
			if (this.getOwnerComponent()._aSelectedColumnKeys && this.getOwnerComponent()._aSelectedColumnKeys.length > 0) {
				oViewModel.setProperty("/showDataEnabled", true); // Enable show data button
			}
			else {
				oViewModel.setProperty("/showDataEnabled", false); // Disable show data button
			}
			
			this.getView().setModel(oViewModel, "view");

			// Restore previous selection if not navigating from entity list
			if (!this._isNavigatingFromEntityList) {
			
				var oTable = this.byId("columnTable");
				var aSelectedKeys = this.getOwnerComponent()._aSelectedColumnKeys || [];

				// updateFinished handler is used to restore selection after items are bound
				oTable.attachEventOnce("updateFinished", function () {
					oTable.getItems().forEach(function(oItem) {
						var sKey = oItem.getBindingContext("EntityColumnList").getProperty("name");
						if (aSelectedKeys.includes(sKey)) {
							oTable.setSelectedItem(oItem, true);
						}
					});
				});
			}
		},

		/**
		 * 
		 * Handler for loading the OData entity definition based on the provided name. 
		 */
		_loadODataProduct: function (sName) {
			var oContextBinding = this.oODataModel.bindContext("/EntityDefinition('" + sName + "')",
				null,
				{
					$select: "elements"
				}
			);

			oContextBinding.requestObject().then(function (oData) {
				var oEntityColumnListModel = new JSONModel();
				oEntityColumnListModel.setData({ elements: oData.elements });
				this.getView().setModel(oEntityColumnListModel, "EntityColumnList");

			}.bind(this)).catch(function (oError) {
				console.error("Error fetching data:", oError);
			});
		},

		//-------------------------------------------------------------------------------------------------------------------

		//----------------------------------Sorting Columns---------------------------------------------------------------------------------

		/**
		 * 
		 * Event handler before opening the column menu to set the sort item state. 
		 */
		onBeforeOpenColumnMenu: function(oEvt) {
			const oMenu = this.byId("menu");
			const oColumn = oEvt.getParameter("openBy");
			const oSortItem = oMenu.getQuickActions()[0].getItems()[0];

			oSortItem.setKey(this._getKey(oColumn));
			oSortItem.setLabel(oColumn.getHeader().getText());
			oSortItem.setSortOrder(oColumn.getSortIndicator());
		},

		/**
		 * 
		 * Helper to get the p13nKey name from a column for sorting. 
		 */
		_getKey: function(oControl) {
			return oControl.data("p13nKey");
		},

		/**
		 * 
		 * Event handler for sorting the table based on the selected column and order from the menu. 
		 */
		onSort: function(oEvent) {
			const oTable = this.byId("columnTable");
			const oBinding = oTable.getBinding("items");
			const oQuickSortItem = oEvent.getParameter("item");
			const sKey = oQuickSortItem.getKey();

			if (!sKey) {
				console.error("Sort key is undefined. Cannot sort.");
				return;
			}

			const aColumns = oTable.getColumns();
			// Update sort indicators
			aColumns.forEach(function(oColumn) {
				if (oColumn.data("p13nKey") === sKey) {
					if(oQuickSortItem.getSortOrder() === "Ascending") {
						oColumn.setSortIndicator("Ascending");
					} else if(oQuickSortItem.getSortOrder() === "Descending") {
						oColumn.setSortIndicator("Descending");
					} else {
						oColumn.setSortIndicator("None");
					}
				}
			});

			// Apply sorting
			if (oQuickSortItem.getSortOrder() === "None") {
				oBinding.sort();
			} else {
				//sort(skey,true(descending)/false(ascending))
				oBinding.sort([new Sorter(sKey, oQuickSortItem.getSortOrder() === "Descending")]);
			}

			
		},

		//-------------------------------------------------------------------------------------------------------------------

		//----------------------------------Enable/Disable Show Data button based on Column Selection---------------------------------------------------------------------------------

		/**
		 * 
		 * Event handler to enable/disable the Show Data button based on columns selection.
		 */
		onColumnTableSelectionChange: function(oEvent) {
			var oTable = oEvent.getSource();
			var aSelectedItems = oTable.getSelectedItems();
			var aSelectedColumns = aSelectedItems.map(function (oItem) {
				return oItem.getBindingContext("EntityColumnList").getProperty("name");
			})
			// Store in a global model to maintain multiselection state even after navigation
			this.getOwnerComponent()._aSelectedColumnKeys = aSelectedColumns;
			var oViewModel = this.getView().getModel("view");
			oViewModel.setProperty("/showDataEnabled", aSelectedColumns.length > 0);
		},

		//-------------------------------------------------------------------------------------------------------------------

		//----------------------------------Navigation Function to Data Column---------------------------------------------------------------------------------

		onShowDataPress: function () {
			// Navigate to the next page with selected data
			this.getOwnerComponent().getHelper().then(function (oHelper) {
				var oNextUIState = oHelper.getNextUIState(3);
				this.oRouter.navTo("entityDataList", {
					layout: oNextUIState.layout,
					name: this._name,
					selectedColumns: encodeURIComponent(JSON.stringify(this.getOwnerComponent()._aSelectedColumnKeys)),
					showDataPressed: true
				});
			}.bind(this));
		},

		//-------------------------------------------------------------------------------------------------------------------

		//----------------------------------Client Side Search Option---------------------------------------------------------------------------------

		onSearch: function (oEvent) {
			var sQuery = oEvent.getParameter("query");
			var oTable = this.byId("columnTable");
			if (!oTable) {
				console.error("Table with ID 'columnTable' not found.");
				return;
			}

			var oModel = this.getView().getModel("EntityColumnList");
			var aColumns = oModel.getProperty("/elements") || [];
			var aColumnKeys = [];
			if (aColumns.length > 0) {
				Object.keys(aColumns[0]).forEach(function (sKey) {
					if (typeof aColumns[0][sKey] === "string") { 
						aColumnKeys.push(sKey);
					}
				});
			} 

			var oBinding = oTable.getBinding("items");

			if (sQuery && sQuery.length > 0 && aColumnKeys.length > 0) {
				var oCustomFilter = new Filter({
					filters: aColumnKeys.map(function (sKey) {
						return new Filter(sKey, FilterOperator.Contains, sQuery);
					}),
				and: false // OR logic: match any column
				});
				oBinding.filter([oCustomFilter], "Application");
			} else {
				oBinding.filter([], "Application");
			}
		},

		//-------------------------------------------------------------------------------------------------------------------

		//----------------------------------Handlers to Maximise / Minimize / Close the Column Screen---------------------------------------------------------------------------------

        handleFullScreen: function () {
			var sNextLayout = this.oModel.getProperty("/actionButtonsInfo/midColumn/fullScreen");
			this.oRouter.navTo("entityColumnList", {layout: sNextLayout, name: this._name});
		},

		handleExitFullScreen: function () {
			var sNextLayout = this.oModel.getProperty("/actionButtonsInfo/midColumn/exitFullScreen");
			this.oRouter.navTo("entityColumnList", {layout: sNextLayout, name: this._name});
		},

		handleClose: function () {
			var sNextLayout = this.oModel.getProperty("/actionButtonsInfo/midColumn/closeColumn");
			this.oRouter.navTo("entityDefinitionList", {layout: sNextLayout});
			// Clean up the global selection state
			if (this.getOwnerComponent()._aSelectedColumnKeys) {
				this.getOwnerComponent()._aSelectedColumnKeys = [];
			}
		},

		//-------------------------------------------------------------------------------------------------------------------

		onExit: function () {
			this.oRouter.getRoute("entityColumnList").detachPatternMatched(this.onRouteMatched, this);
		}
	});
});