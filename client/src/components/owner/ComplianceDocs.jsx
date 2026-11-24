import { useState } from 'react';
import { assetUrl, errorMessage } from '../../api/http.js';
import { ownerApi } from '../../api/index.js';
import { useAsync } from '../../hooks/useAsync.js';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Field,
  FormError,
  Input,
  Select,
  Skeleton,
  useConfirm,
  useToast,
} from '../ui/index.js';
import styles from './ComplianceDocs.module.css';

const TYPES = [
  ['FOOD_LICENSE', 'Food licence'],
  ['TRADE_LICENSE', 'Trade licence'],
  ['OWNER_ID', 'Owner ID'],
  ['OTHER', 'Other'],
];

const typeLabel = (type) => TYPES.find(([v]) => v === type)?.[1] || type;
const date = (v) => (v ? new Date(v).toLocaleDateString() : '—');

/** Owner-side uploader for licences/IDs; an admin verifies each document. */
export default function ComplianceDocs() {
  const { data, loading, error, reload } = useAsync(() => ownerApi.getRestaurant(), []);
  const [type, setType] = useState('FOOD_LICENSE');
  const [label, setLabel] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const confirm = useConfirm();
  const toast = useToast();

  const docs = data?.documents || [];

  const upload = async (e) => {
    e.preventDefault();
    if (!file) return setUploadError('Choose the document file to upload.');
    setBusy(true);
    setUploadError('');
    try {
      await ownerApi.addDocument({
        document: file,
        type,
        label: label.trim(),
        ...(expiresAt && { expiresAt: new Date(expiresAt).toISOString() }),
      });
      setFile(null);
      setLabel('');
      setExpiresAt('');
      e.target.reset();
      toast.success('Document uploaded. An admin will review it.');
      await reload();
    } catch (err) {
      setUploadError(errorMessage(err));
    }
    setBusy(false);
  };

  const remove = async (doc) => {
    const ok = await confirm({
      title: 'Remove this document?',
      message: `${typeLabel(doc.type)}${doc.label ? ` — ${doc.label}` : ''} will be deleted. You can upload it again later.`,
      confirmLabel: 'Remove document',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await ownerApi.removeDocument(doc._id);
      toast.success('Document removed.');
      await reload();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <Card as="section">
      <CardHeader
        title="Compliance documents"
        hint="Upload your food licence, trade licence and owner ID. An admin verifies each one; verified documents earn a badge on your restaurant."
      />

      {loading && !data ? (
        <Skeleton height={120} />
      ) : error ? (
        <FormError error={error} />
      ) : docs.length === 0 ? (
        <EmptyState icon="inbox" title="No documents yet">
          Upload at least a food licence so the platform can verify your kitchen.
        </EmptyState>
      ) : (
        <ul className={styles.list}>
          {docs.map((doc) => {
            const expired = doc.expiresAt && new Date(doc.expiresAt).getTime() < Date.now();
            return (
              <li key={doc._id} className={styles.row}>
                <div className={styles.info}>
                  <strong>
                    {typeLabel(doc.type)}
                    {doc.label && <span className={styles.label}> · {doc.label}</span>}
                  </strong>
                  <span className={styles.meta}>
                    <a href={assetUrl(doc.fileUrl)} target="_blank" rel="noreferrer">
                      View file
                    </a>
                    {' · '}
                    {doc.expiresAt ? `Expires ${date(doc.expiresAt)}` : 'No expiry'}
                  </span>
                  {doc.note && <span className={styles.note}>{doc.note}</span>}
                </div>
                <div className={styles.actions}>
                  {doc.verifiedAt ? (
                    <Badge tone="success" dot>
                      Verified
                    </Badge>
                  ) : (
                    <Badge tone="warning">Awaiting review</Badge>
                  )}
                  {expired && <Badge tone="danger">Expired</Badge>}
                  <Button size="sm" variant="dangerGhost" onClick={() => remove(doc)}>
                    Remove
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <form className={styles.form} onSubmit={upload}>
        <div className={styles.grid}>
          <Field label="Document type">
            <Select value={type} onChange={(e) => setType(e.target.value)}>
              {TYPES.map(([value, text]) => (
                <option key={value} value={value}>
                  {text}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Description" optional hint="e.g. the licence number, for your own reference.">
            <Input value={label} maxLength={80} onChange={(e) => setLabel(e.target.value)} />
          </Field>
          <Field label="Expires" optional>
            <Input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
          </Field>
        </div>
        <Field label="File" hint="A clear photo or scan: PNG, JPG or WEBP, up to 2 MB.">
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className={styles.file}
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
        </Field>
        <FormError error={uploadError} />
        <div>
          <Button type="submit" variant="primary" loading={busy} icon="plus">
            Upload document
          </Button>
        </div>
      </form>
    </Card>
  );
}
