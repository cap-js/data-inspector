sap.ui.define(
  [
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/Column",
    "sap/m/ColumnListItem",
    "sap/m/Text",
    "sap/ui/model/type/String",
    "sap/ui/core/Fragment",
    "sap/m/Select",
    "sap/m/MultiInput",
    "sap/m/Button",
    "sap/ui/core/Item",
    "sap/ui/model/Filter",
  ],
  function (
    Controller,
    JSONModel,
    Column,
    ColumnListItem,
    Text,
    TypeString,
    Fragment,
    Select,
    MultiInput,
    Button,
    Item,
    Filter
  ) {
    "use strict";

    return Controller.extend("sap.cap.datainspector.datainspectorui.controller.dataview", {
      onInit: function () {
        this.oOwnerComponent = this.getOwnerComponent();

        this.oRouter = this.oOwnerComponent.getRouter();
        this.oModel = this.oOwnerComponent.getModel(); // use default model for UI state
        this.oODataModel = this.getOwnerComponent().getModel("ODataModel"); // OData V4 model
        this.oRouter.getRoute("entityDataList").attachPatternMatched(this._onPatternMatch, this);
      },

      // Helper function to handle route pattern match
      _onPatternMatch: function (oEvent) {
        this._name = oEvent.getParameter("arguments").name || this._name || "0";
        this._showDataPressed =
          oEvent.getParameter("arguments").showDataPressed === true ||
          oEvent.getParameter("arguments").showDataPressed === "true"
            ? true
            : undefined;

        let oViewModel;
        // Setting the name in a view model for easy binding in the view
        if (this._showDataPressed) {
          oViewModel = new JSONModel();
        } else {
          oViewModel = this.getView().getModel("view");
        }
        oViewModel.setProperty("/name", this._name);
        this.getView().setModel(oViewModel, "view");

        let sSelectedColumns = oEvent.getParameter("arguments").selectedColumns;
        this._aSelectedColumns = JSON.parse(decodeURIComponent(sSelectedColumns));
        oViewModel.setProperty("/selectedColumns", this._aSelectedColumns);

        // If user clicks on show data button from previous screen, we prepare the data table afresh
        // Otherwise, if table already exists with/without data we retain it
        if (this._showDataPressed) {
          this._prepareDataTable();
        } else if (this.byId("dataTable")?.getModel("tableData")) {
          return;
        }
      },

      // Helper funtion to prepare template for data table
      _prepareDataTable() {
        let oTable = this.byId("dataTable");

        // Clear existing content
        if (oTable.getBinding("items")) {
          oTable.getBinding("items").destroy();
        }

        oTable.removeAllColumns();
        oTable.removeAllItems();

        this._aSelectedColumns.forEach(function (oColumn) {
          //Calculate column width based on header length. Limit min 5rem max 30rem.
          //1 rem equals approximately 0.6 to 0.7 of character width so using 0.65 here.
          var iCalculatedWidth = Math.ceil(oColumn.length * 0.65) + 1; //1rem padding
          var iWidth = Math.max(5, Math.min(iCalculatedWidth, 30)); //min 5rem max 30rem
          oTable.addColumn(
            new Column({
              header: new Text({ text: oColumn, wrapping: true, width: iWidth + "rem" }),
            })
          );
        });

        // Create local JSON model for table data
        var oTableModel = new JSONModel({
          items: [],
        });

        // Set the model to the table
        oTable.setModel(oTableModel, "tableData");

        let aCells = this._aSelectedColumns.map(function (sColumn) {
          return new Text({ text: "{tableData>" + sColumn + "}" });
        });
        let oTemplate = new ColumnListItem({
          cells: aCells,
        });
        // Bind items to local model
        oTable.bindItems({
          path: "tableData>/items",
          template: oTemplate,
        });
        this._paginationLimit = 20;

        // Reset any existing advanced filters
        this._advancedFilter = undefined;
        if (this._oAdvancedFilterDialog) {
          this._oAdvancedFilterDialog.destroy();
          this._oAdvancedFilterDialog = undefined;
        }
        this._fetchData(0, this._paginationLimit);
      },

      // Helper function to fetch data from the backend API
      _fetchData: async function (iSkip, iTop, filter) {
        let sKey = encodeURIComponent(this._name);

        let aFilters = [],
          oTable = this.byId("dataTable"),
          oViewModel = this.getView().getModel("view"),
          aSelectedColumns = this._aSelectedColumns,
          sFilterValues;

        if (filter && filter.length > 0) {
          // Build r_filter string for all columns and values
          sFilterValues = this._buildFilterParts();

          oViewModel.setProperty("/filterString", sFilterValues);
          oViewModel.setProperty("/advancedFilterVisible", true);
        } else {
          oViewModel.setProperty("/advancedFilterVisible", false);
        }

        aFilters.push(new Filter("entityName", "EQ", sKey));

        let oListBinding = this.oODataModel.bindList("/Data", null, null, aFilters, {
          r_select: this._aSelectedColumns.join(","), // custom parameter
          r_filter: sFilterValues, // custom parameter
          $count: true, // enable OData count
        });
        //used async await to wait for oListBinding requestContexts to bind data
        await oListBinding
          .requestContexts(iSkip, iTop)
          .then(function (aContexts) {
            let aResults = aContexts.map(function (oContext) {
              return oContext.getObject();
            });

            let iTotalCount = oListBinding.getCount();

            oTable.setBusy(true);
            let oTableModel = oTable.getModel("tableData");

            // Build array of row objects containing only the selected columns

            let aNewItems = aResults.map(function (item) {
              let oRecord = item.record || {},
                oRow = {};
              aSelectedColumns.forEach(function (col) {
                oRow[col] = oRecord[col];
              });
              return oRow;
            });

            // Append new items to existing items in the model

            let aExistingItems = oTableModel.getProperty("/items") || [];
            aNewItems = iSkip === 0 ? aNewItems : aExistingItems.concat(aNewItems);

            oTableModel.setProperty("/items", aNewItems);
            oTableModel.setProperty("/totalCount", parseInt(iTotalCount));
            oViewModel.setProperty("/loadedRowsCount", parseInt(aNewItems.length));
            oViewModel.setProperty("/rowCount", parseInt(iTotalCount));
            oTable.setBusy(false);
          })
          .catch(function (oError) {
            console.error("Error fetching data:", oError);
          });
      },

      onMorePress: async function () {
        var oTable = this.byId("dataTable");
        var oTableModel = oTable.getModel("tableData");
        var iCurrentLength = oTableModel.getProperty("/items")?.length || 0;
        var iTotalCount = oTableModel.getProperty("/totalCount") || 0;
        if (iCurrentLength < iTotalCount) {
          if (this._advancedFilter)
            //used async await to wait for oListBinding requestContexts to fetch data in table

            await this._fetchData(iCurrentLength, this._paginationLimit, this._advancedFilter);
          else await this._fetchData(iCurrentLength, this._paginationLimit);
        }

        // Focus on the first newly added row after items are updated
        oTable.attachEventOnce("updateFinished", function () {
          let aItems = oTable.getItems();
          if (aItems[iCurrentLength]) {
            aItems[iCurrentLength].focus();
          }
        });
      },

      // Event handler for Full Screen button
      handleFullScreen: function () {
        let sNextLayout = this.oModel.getProperty("/actionButtonsInfo/endColumn/fullScreen");
        this.oRouter.navTo("entityDataList", {
          layout: sNextLayout,
          name: this._name,
          selectedColumns: encodeURIComponent(JSON.stringify(this._aSelectedColumns)),
          showDataPressed: false,
        });
      },

      // Event handler for Exit Full Screen button
      handleExitFullScreen: function () {
        let sNextLayout = this.oModel.getProperty("/actionButtonsInfo/endColumn/exitFullScreen");
        this.oRouter.navTo("entityDataList", {
          layout: sNextLayout,
          name: this._name,
          selectedColumns: encodeURIComponent(JSON.stringify(this._aSelectedColumns)),
          showDataPressed: false,
        });
      },

      // Event handler for Close button
      handleClose: function () {
        let sNextLayout = this.oModel.getProperty("/actionButtonsInfo/endColumn/closeColumn");
        this.getView().setModel(null, "view"); // Clear the view model to reset state
        // Properly destroy the dialog and clear the reference
        if (this._oAdvancedFilterDialog) {
          this._oAdvancedFilterDialog.destroy();
          this._oAdvancedFilterDialog = undefined;
        }
        if (this._advancedFilter) {
          this._advancedFilter = undefined;
        }
        this.oRouter.navTo("entityColumnList", {
          layout: sNextLayout,
          name: this._name,
        });
      },

      // Cleanup on controller exit
      onExit: function () {
        this.oRouter.getRoute("entityDataList").detachPatternMatched(this._onPatternMatch, this);
      },

      /**
       * Below section contains code for Advanced Filter Dialog
       */

      // Helper Function to update filter row count in dialog title
      _updateFilterRowCount: function () {
        let oTable = this._oAdvancedFilterDialog.getContent()[1];
        let oViewModel = this.getView().getModel("view");
        oViewModel.setProperty("/filterRowCount", oTable.getItems().length);
      },

      // Helper function to build filter parts for API call
      _buildFilterParts: function () {
        let aColumnValueMap = this._advancedFilter;
        let filterValues = aColumnValueMap // Returns array of filter strings for API call
          .map(function (obj) {
            if (obj.values && obj.values.length > 0) {
              let aValueFilters = obj.values.map(function (val) {
                let sVal = val.replace(/^[=*!<>]+|[*!]+$/g, "").replace(/^(\(|\))|(\(|\))$/g, ""); // Clean the value of any operators or parentheses
                if (val === "<empty>") {
                  // Value is <empty> or null
                  return obj.column + " eq null";
                } else if (val === "!(<empty>)") {
                  // Value is not <empty> or not null
                  return obj.column + " ne null";
                } else if (/^=/.test(val)) {
                  // Value equals to X: e.g., =X
                  return obj.column + " eq '" + sVal + "'";
                } else if (/^!\(=/.test(val)) {
                  // Value not equals to X: e.g., !(=X)
                  return obj.column + " ne '" + sVal + "'";
                } else if (/^<=/.test(val)) {
                  // Value less than or equal to X: e.g., <=X
                  let sVal = val.replace(/^<=/, "");
                  return obj.column + " le '" + sVal + "'";
                } else if (/^>=/.test(val)) {
                  // Value greater than or equal to X: e.g., >=X
                  let sVal = val.replace(/^>=/, "");
                  return obj.column + " ge '" + sVal + "'";
                } else if (/^</.test(val)) {
                  // Value less than X: e.g., <X
                  return obj.column + " lt '" + sVal + "'";
                } else if (/^>/.test(val)) {
                  // Value greater than X: e.g., >X
                  return obj.column + " gt '" + sVal + "'";
                } else if (/^\*/.test(val) && /\*$/.test(val)) {
                  // Value contains X: e.g., *X*
                  return "contains(" + obj.column + ",'" + sVal + "')";
                } else if (/^[^*]+?\*$/.test(val)) {
                  // Value startswith X: e.g., X*
                  let sVal = val.replace(/\*$/, "");
                  return "startswith(" + obj.column + ",'" + sVal + "')";
                } else if (/^\*[^*]+?$/.test(val)) {
                  // Value endswith X: e.g., *X
                  let sVal = val.replace(/^\*/, "");
                  return "endswith(" + obj.column + ",'" + sVal + "')";
                } else if (/^\d+\.\.\.\d+$/.test(val)) {
                  // Value range X...Y: e.g., 10...20
                  let parts = val.split("...");
                  return obj.column + " ge " + parts[0] + " and " + obj.column + " le " + parts[1];
                } else {
                  // Default: treat as equals
                  return obj.column + " eq '" + val + "'";
                }
              });
              return aValueFilters.join(" and ");
            }
            return "";
          })
          .filter(Boolean);

        if (Array.isArray(filterValues)) {
          filterValues = filterValues.join(" and ");
        }

        return filterValues;
      },

      // Event handler to open Advanced Filter Dialog
      onAdvancedFilterPress: async function () {
        if (!this._oAdvancedFilterDialog) {
          // Generate a unique fragment ID
          const fragmentId = this.createId("AdvancedFilterDialog" + Date.now());

          // Wait for the fragment to load
          const oDialog = await Fragment.load({
            id: fragmentId,
            name: "sap.cap.datainspector.datainspectorui.view.AdvancedFilterDialog",
            controller: this,
          });

          // Add the dialog as a dependent to the view
          this.getView().addDependent(oDialog);
          this._oAdvancedFilterDialog = oDialog;

          // Access the MultiInput control using Fragment.byId
          const oMultiInput = Fragment.byId(fragmentId, "multiInput");
          if (oMultiInput) {
            this._oMultiInput = oMultiInput;
          }
        }

        // Update the filter row count
        this._updateFilterRowCount();

        // Open the dialog
        this._oAdvancedFilterDialog.open();
      },
      // Event handler to add a new filter row
      onAddPress: function () {
        let oTable = this._oAdvancedFilterDialog.getContent()[1];
        let oColumnListItem = new ColumnListItem({
          cells: [
            new Select({
              items: {
                path: "view>/selectedColumns",
                template: new Item({
                  key: "{view>}",
                  text: "{view>}",
                }),
              },
            }),
            new MultiInput({
              placeholder: "Enter filter values",
              valueHelpRequest: this.onValueHelpRequest.bind(this),
            }),
            new Button({
              icon: "sap-icon://decline",
              type: "Transparent",
              press: this.onRemovePress.bind(this),
            }),
          ],
        });
        oTable.addItem(oColumnListItem);

        this._updateFilterRowCount();
      },

      // Event handler to remove selected filter rows
      onRemovePress: function (oEvent) {
        var oButton = oEvent.getSource();

        var oRow = oButton.getParent();

        var oTable = this._oAdvancedFilterDialog.getContent()[1];

        oTable.removeItem(oRow);

        // Update the filter row count
        this._updateFilterRowCount();
      },

      // Event handler to apply filters and fetch data
      onApplyAdvancedFilter: function () {
        let oDialog = this._oAdvancedFilterDialog;
        let oTable = oDialog.getContent()[1];
        let oItems = oTable.getItems();

        // Create an array to hold all selected column-value pairs
        let aColumnValueMap = [];

        // Loop through each row
        oItems.forEach(function (oItem) {
          let oColumnSelect = oItem.getCells()[0];
          let oMultiInput = oItem.getCells()[1];

          // Get the selected column key from the sap.m.Select control
          let sSelectedColumn = oColumnSelect.getSelectedKey();

          // Get the values from the sap.m.MultiInput control
          let aTokens = oMultiInput ? oMultiInput.getTokens() : [];
          let aValues = aTokens.map(function (token) {
            return token.getText();
          });

          // Push the column-value pair into the map if there are values
          if (aValues.length > 0) {
            aColumnValueMap.push({
              column: sSelectedColumn,
              values: aValues,
            });
          }
        });

        if (aColumnValueMap.length > 0) {
          this._advancedFilter = aColumnValueMap;

          this._fetchData(0, this._paginationLimit, this._advancedFilter);
        } else {
          this._advancedFilter = undefined;
          this._fetchData(0, this._paginationLimit);
        }

        oDialog.close();
      },

      // Event handler to cancel and close the dialog
      onCancelAdvancedFilter: function () {
        this._oAdvancedFilterDialog.close();
      },

      /**
       * Below section contains code for Value Help Dialog
       */

      // Event handler to open Value Help Dialog
      onValueHelpRequest: function (oEvent) {
        this._oMultiInput = oEvent.getSource();

        Fragment.load({
          name: "sap.cap.datainspector.datainspectorui.view.ValueHelpDialog",
          controller: this,
        }).then(
          function (oDialog) {
            this.getView().addDependent(oDialog);
            this._oValueHelpDialog = oDialog;

            // Set the filter bar programmatically
            let oFilterBar = sap.ui.getCore().byId("valueHelpFilterBar");
            oDialog.setFilterBar(oFilterBar);

            oDialog.setRangeKeyFields([
              {
                label: "Advanced Filter",
                key: "AdvancedFilter",
                type: "string",
                typeInstance: new TypeString(),
              },
            ]);

            // Get existing tokens from MultiInput
            let oMultiInput = this._oMultiInput;
            if (oMultiInput) {
              let aTokens = oMultiInput.getTokens();
              oDialog.setTokens(aTokens);
            }
            oDialog.open();
          }.bind(this)
        );
      },

      // Event handler when OK is pressed in Value Help Dialog
      onValueHelpOkPress: function (oEvent) {
        let aTokens = oEvent.getParameter("tokens");

        // Set tokens in MultiInput
        let oMultiInput = this._oMultiInput;
        if (oMultiInput) {
          oMultiInput.setTokens(aTokens);
        }
        this._oValueHelpDialog.close();
      },

      // Event handler when Cancel is pressed in Value Help Dialog
      onValueHelpCancelPress: function () {
        this._oValueHelpDialog.close();
      },

      // Event handler after Value Help Dialog is closed
      onValueHelpAfterClose: function () {
        this._oValueHelpDialog.destroy();
        this._oValueHelpDialog = null;
      },
    });
  }
);
