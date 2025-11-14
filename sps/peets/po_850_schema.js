const sample_po_850 = [
	{
		Header: {
			OrderHeader: {
				PurchaseOrderNumber: "",
				TsetPurposeCode: "",
				PrimaryPOTypeCode: "",
				PurchaseOrderDate: "",
				Vendor: "",
				BuyersCurrency: "",
			},
			PaymentTerms: {
				TermsDescription: "",
			},
			Date: {
				DateTimeQualifier: "",
				Date: "",
			},
			Contact: {},
			Address: {
				AddressTypeCode: "",
				LocationCodeQualifier: "",
				AddressLocationNumber: "",
				AddressName: "",
				Address1: "",
				Address2: "",
				Address3: "",
				Address4: "",
				City: "",
				State: "",
				PostalCode: "",
				Country: "",
				Contact: {},
			},
			FOBRelatedInstruction: "",
			CarrierInformation: {
				AllowChrgIndicatior: "",
				AllowChrgCode: "",
				AllowChrgAmt: "",
				AllowChrgHandlingDescription: "",
			},
			References: {
				ReferenceQual: "",
				ReferenceID: "",
			},
			Notes: "",
		},
		LineItems: [
			{
				LineItem: {
					OrderLine: {
						LineSequenceNumber: "",
						BuyerPartNumber: "",
						VendorPartNumber: "",
						ConsumerPackageCode: "",
						PurchasePrice: "",
						InvoiceQty: "",
						InvoiceQtyUOM: "",
					},
					Dates: {},
					ProductOrItemDescription: {
						ProductCharacteristicCode: "",
						ProductDescription: "",
					},
					QuantitiesSchedulesLocations: {
						AllowChrgIndicator: "",
						AllowChrgCode: "",
						AllowChrgAmt: "",
						AllowChrgHandlingDescription: "",
						LocationQuantity: "",
					},
				},
			},
		],
		Summary: {
			TotalAmount: "",
			TotalNetSalesAmount: "",
			TotalLineItemNumber: "",
		},
	},
];
