using {DataInspectorService} from './DataInspectorService';

annotate DataInspectorService with @(requires: 'authenticated-user');

annotate DataInspectorService.EntityDefinition with @(restrict: [{
    grant: ['READ'],
    to   : 'capDataInspectorReadonly'
}]);

annotate DataInspectorService.Data with @(restrict: [{
    grant: ['READ'],
    to   : 'capDataInspectorReadonly'
}]);
