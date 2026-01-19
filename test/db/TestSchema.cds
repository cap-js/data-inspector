namespace datainspector.test.db;

using {
    cuid,
    managed
} from '@sap/cds/common';

@title: 'Products Table'
entity Product : cuid, managed {
    productName : String not null;
    description : String;
    quantity    : Integer not null;
    mrp         : Double not null;
    category    : Association to one Category;
}

@title: 'Categories Table'
entity Category : cuid {
    name : String;
}

@title: 'Orders Table'
@PersonalData
entity Order : cuid, managed {
    totalAmount : Double;
    status      : String not null;
    date        : DateTime;
    phoneNumber : String not null;
    address     : String not null;
    orderItem   : Composition of many OrderItem
                      on orderItem.order = $self;
}

@title: 'Order Items Table'
entity OrderItem : cuid, managed {
    itemName  : String not null;
    quantity  : Integer;
    itemPrice : Double;
    order     : Association to one Order;
    product   : Association to one Product;
}


// Reference - https://cap.cloud.sap/docs/cds/types
@title: 'Of All CDS Core Types'
entity CdsCoreTypes {
    key     uuid         : UUID;
            boolean      : Boolean not null;
            integer      : Integer default 8;
            int16        : Int16;
            int32        : Int32;
            int64        : Int64;
            uInt8        : UInt8;
            decimal      : Decimal;
            double       : Double;
            date         : Date;
            time         : Time;
            dateTime     : DateTime;
            timestamp    : Timestamp;
            string       : String(88);
            binary       : Binary;
            largeBinary  : LargeBinary;
            largeString  : LargeString;
            map          : Map;
            // vector       : Vector; Type “cds.Vector” is only supported for SQL dialect ‘hana’, not ‘sqlite’
            hiddenField  : String;
    virtual virtualField : String;
}


@title: 'HelloWorld Table'
entity HelloWorld {
    key helloId  : String;
    key worldId  : String;
    key otherId  : String;
        quote    : String;
        color    : String;
        universe : String;
        age      : Integer;
}

@title: 'Produck Table'
@cds.persistence.skip
entity Produck {
    key id   : String;
        name : String;
}

@title: 'Food Table'
entity Food {
    key id          : String;
        name        : String;
        ingredients : String;
        description : String;
}
