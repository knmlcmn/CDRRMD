// The responder app uses the same canonical map renderer as the admin and
// barangay monitoring portals. Keep rescuer-specific state in the screen and
// avoid maintaining a second implementation of the shared map layers.
export {
  buildCalambaMapHtml,
  type Coordinate,
  type MapBehavior,
  type MonitoringLayerVisibility,
} from '../../../../admin-web/src/utils/calambaMapHtml';
