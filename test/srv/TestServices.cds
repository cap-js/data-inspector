namespace datainspector.test.srv;

using {datainspector.test.db as db} from '../db/TestSchema';

service ProductService {
    @odata.draft.enabled
    entity Product  as select from db.Product;

    entity Category as projection on db.Category;

    @cds.persistence.skip: true
    @title               : 'Product Discount Transient Table'
    entity ProductDiscount {
        key productName : String;
            discount    : Integer not null;
    }

}

service OrderService {
    @odata.draft.enabled
    entity Order     as select from db.Order;

    entity OrderItem as select from db.OrderItem;
    entity Product   as projection on db.Product;
}

service FoodService {
    @cds.query.limit: {
        default: 10,
        max    : 20
    }
    entity Food as projection on db.Food;
}
