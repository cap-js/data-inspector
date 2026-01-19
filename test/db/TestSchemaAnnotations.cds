using {datainspector.test.db} from './TestSchema';

annotate db.Category with @HideFromDataInspector;
annotate db.Order : phoneNumber with @HideFromDataInspector;
annotate db.CdsCoreTypes : hiddenField with @HideFromDataInspector;
annotate db.Order : phoneNumber with @PersonalData.IsPotentiallySensitive;
annotate db.Order : address with @PersonalData.IsPotentiallySensitive;
annotate db.CdsCoreTypes : date with @PersonalData.IsPotentiallySensitive;
