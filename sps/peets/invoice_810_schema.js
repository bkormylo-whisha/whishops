const sample_invoice_810 = [
	{
		Header: {
			InvoiceHeader: {
				InvoiceNumber: "",
				InvoiceDate: "",
				PurchaseOrderDate: "",
				PurchaseOrderNumber: "",
				Vendor: "",
				CarrierProNumber: "",
				BillOfLadingNumber: "",
				ShipDate: "",
				CustomerOrderNumber: "",
			},
			PaymentTerms: {
				TermsNetDueDays: "",
				TermsNetDueDate: "",
				TermsDescription: "",
			},
			References: {
				ReferenceQual: "",
				ReferenceID: "",
			},
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
			},
			ChargesAllowances: {
				AllowChrgIndicatior: "",
				AllowChrgCode: "",
				AllowChrgAmt: "",
				AllowChrgHandlingDescription: "",
			},
			FOBRelatedInstruction: "",
		},
		LineItems: [
			{
				LineItem: {
					InvoiceLine: {
						LineSequenceNumber: "",
						BuyerPartNumber: "",
						VendorPartNumber: "",
						ConsumerPackageCode: "",
						PurchasePrice: "",
						InvoiceQty: "",
						InvoiceQtyUOM: "",
					},
					ProductOrItemDescription: {
						ProductCharacteristicCode: "",
						ProductDescription: "",
					},
					ChargesAllowances: {
						AllowChrgIndicator: "",
						AllowChrgCode: "",
						AllowChrgAmt: "",
						AllowChrgHandlingDescription: "",
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
