interface ReceiptPreviewModalProps {
  imageUrl: string;
  onClose: () => void;
}

export default function ReceiptPreviewModal({ imageUrl, onClose }: ReceiptPreviewModalProps) {
  return (
    <div className="receipt-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="receipt-modal" role="dialog" aria-modal="true" aria-labelledby="receipt-modal-title">
        <header><div><p className="eyebrow">PRIVATE PAYMENT PROOF</p><h2 id="receipt-modal-title">Receipt image</h2></div><button type="button" onClick={onClose} aria-label="Close receipt">×</button></header>
        <img src={imageUrl} alt="Customer-submitted payment receipt" />
        <p>Verify this transaction in the selected payment account before approving the license.</p>
      </section>
    </div>
  );
}
