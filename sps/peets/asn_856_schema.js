const sample_asn = [
	{
		Header: {
			ShipmentHeader: {
				ShipmentIdentification: "",
				ShipDate: "",
				TsetPurposeCode: "",
				ShipNoticeDate: "",
				BillOfLadingNumber: "",
				CarrierProNumber: "",
				CurrentScheduledDeliveryDate: "",
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
			CarrierInformation: {
				CarrierTransMethodCode: "",
				CarrierAlphaCode: "",
				CarrierRouting: "",
			},
			QuantityAndWeight: {
				PackingMedium: "",
				LadingQuality: "",
			},
			FOBRelatedInstruction: "",
		},
		OrderLevel: {
			OrderHeader: {
				PurchaseOrderNumber: "",
				PurchaseOrderDate: "",
				CustomerOrderNumber: "",
				Vendor: "",
			},
			PackLevel: {
				Pack: "",
				ItemLevel: {
					ShipmentLine: {
						LineSequenceNumber: "",
						BuyerPartNumber: "",
						VendorPartNumber: "",
						ConsumerPackageCude: "",
						ShipQty: "",
						ShipQtyUOM: "",
					},
					References: {
						ReferenceQualifier: "", // Two?
					},
					ProductOrItemDescription: {
						ProductOrCharacteristicCode: "",
						ProductDescription: "",
					},
					Dates: {
						DateTimeQualifier: "",
						Date: "",
					},
					Address: "",
				},
			},
		},
		Summary: {
			TotalLineItemNumber: "",
		},
	},
];
