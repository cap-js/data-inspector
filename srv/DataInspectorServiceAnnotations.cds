using {DataInspectorService} from './DataInspectorService';

annotate DataInspectorService with @(requires: 'capDataInspectorReadonly');

annotate DataInspectorService.EntityDefinition with @(restrict: [{
    grant: ['READ'],
    to   : 'capDataInspectorReadonly'
}]);

annotate DataInspectorService.Data with @(restrict: [{
    grant: ['READ'],
    to   : 'capDataInspectorReadonly'
}]);
