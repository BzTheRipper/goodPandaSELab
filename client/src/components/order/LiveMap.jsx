import { useEffect, useMemo, useState } from 'react';
import L from 'leaflet';
import { CircleMarker, MapContainer, Polyline, TileLayer, Tooltip, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import styles from './LiveMap.module.css';

/** Keeps the view fitted to the route as the drone moves. */
function FitRoute({ points }) {
  const map = useMap();
  useEffect(() => {
    const valid = points.filter(Boolean);
    if (!valid.length) return;
    if (valid.length === 1) return map.setView(valid[0], 14);
    map.fitBounds(valid.map((p) => [p.lat, p.lng]), { padding: [42, 42], maxZoom: 14 });
  }, [map, JSON.stringify(points)]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

const droneIcon = L.divIcon({
  className: styles.droneIcon,
  html: '<span>🛸</span>',
  iconSize: [30, 30],
  iconAnchor: [15, 15],
});

/**
 * Real map view of the delivery. Free OpenStreetMap tiles need no API key.
 * Falls back to a message if coordinates are missing, so nothing crashes.
 */
export default function LiveMap({ restaurant, hub, droneLocation }) {
  const [failed, setFailed] = useState(false);
  const points = useMemo(
    () =>
      [
        restaurant?.location && { ...restaurant.location, label: restaurant.name || 'Restaurant' },
        droneLocation && { ...droneLocation, label: 'Drone' },
        hub?.location && { ...hub.location, label: hub.name || 'Hub' },
      ].filter(Boolean),
    [restaurant, hub, droneLocation]
  );

  useEffect(() => {
    if (!failed) return undefined;
    const id = window.setTimeout(() => setFailed(false), 5000);
    return () => window.clearTimeout(id);
  }, [failed]);

  if (points.length < 2) {
    return <div className={styles.fallback}>Live map is unavailable until the route has coordinates.</div>;
  }

  const line = points.filter((p) => p.label !== 'Drone').map((p) => [p.lat, p.lng]);

  return (
    <div className={styles.wrap} onError={() => setFailed(true)}>
      <MapContainer
        center={[points[0].lat, points[0].lng]}
        zoom={12}
        scrollWheelZoom={false}
        className={styles.map}
        attributionControl
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          eventHandlers={{ tileerror: () => setFailed(true) }}
        />
        <Polyline positions={line} pathOptions={{ color: '#166534', weight: 3, dashArray: '6 6' }} />
        {droneLocation && (
          <CircleMarker
            center={[droneLocation.lat, droneLocation.lng]}
            radius={12}
            pathOptions={{ color: '#166534', fillColor: '#22c55e', fillOpacity: 0.9 }}
          >
            <Tooltip direction="top" offset={[0, -8]}>
              Drone
            </Tooltip>
          </CircleMarker>
        )}
        {points
          .filter((p) => p.label !== 'Drone')
          .map((p) => (
            <CircleMarker
              key={p.label}
              center={[p.lat, p.lng]}
              radius={7}
              pathOptions={{ color: '#14532d', fillColor: p.label.startsWith('Hub') ? '#f59e0b' : '#16a34a', fillOpacity: 1 }}
            >
              <Tooltip direction="top" offset={[0, -6]}>
                {p.label}
              </Tooltip>
            </CircleMarker>
          ))}
        <FitRoute points={points} />
      </MapContainer>
      {failed && <div className={styles.tileWarning}>Map tiles are offline — live tracking will resume when they load.</div>}
    </div>
  );
}
