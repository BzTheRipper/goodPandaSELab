import { Link } from 'react-router-dom';
import styles from './Table.module.css';

const cx = (...c) => c.filter(Boolean).join(' ');

/**
 * Responsive data table: a real <table> on desktop, stacked cards below 768px.
 * columns: [{ key, header, render?(row), align?, primary?, hideOnMobile?, interactive?, nowrap? }]
 * rowTo(row) makes the whole row a link (via the primary column).
 */
export default function Table({ columns, rows, rowKey = (r) => r._id ?? r.id, rowTo, caption, empty, className }) {
  const primary = columns.find((c) => c.primary) ?? columns[0];
  return (
    <div className={cx(styles.wrap, className)}>
      <table className={cx(styles.table, styles.stack)}>
        {caption && <caption className="visually-hidden">{caption}</caption>}
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} scope="col" className={cx(styles[c.align])}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className={styles.empty}>
                {empty}
              </td>
            </tr>
          ) : (
            rows.map((row) => {
              const to = rowTo?.(row);
              return (
                <tr key={rowKey(row)} className={cx(styles.row, to && styles.clickable)}>
                  {columns.map((c) => {
                    const value = c.render ? c.render(row) : row[c.key];
                    const isPrimary = c === primary;
                    return (
                      <td
                        key={c.key}
                        data-label={c.header}
                        className={cx(
                          styles[c.align],
                          isPrimary && styles.primaryCell,
                          c.hideOnMobile && styles.hideMobile,
                          c.interactive && styles.lift,
                          c.nowrap && styles.nowrap,
                        )}
                      >
                        {isPrimary && to ? (
                          <Link to={to} className={styles.rowLink}>
                            {value}
                          </Link>
                        ) : (
                          value
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
