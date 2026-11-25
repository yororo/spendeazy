import Svg, { Circle, Path, Rect } from "react-native-svg";

// Eight silhouettes with solid/outline variants distinguish shared-color series.
// The controller retains the assigned index by Category ID for the whole scope.
export function CategoryPoint({ markerIndex, color, x = 6, y = 6, size = 4 }: {
  markerIndex: number; color: string; x?: number; y?: number; size?: number;
}) {
  const shape = markerIndex % 8;
  const fill = Math.floor(markerIndex / 8) % 2 === 0 ? color : "none";
  if (shape === 0) return <Circle cx={x} cy={y} r={size} fill={fill} stroke={color} strokeWidth={1.5} />;
  if (shape === 1) return <Rect x={x - size} y={y - size} width={size * 2} height={size * 2} fill={fill} stroke={color} strokeWidth={1.5} />;
  const paths = [
    `M ${x} ${y - size} L ${x + size} ${y} L ${x} ${y + size} L ${x - size} ${y} Z`,
    `M ${x} ${y - size} L ${x + size} ${y + size} L ${x - size} ${y + size} Z`,
    `M ${x - size} ${y - size} L ${x + size} ${y - size} L ${x} ${y + size} Z`,
    `M ${x - size} ${y} L ${x - size / 2} ${y - size} H ${x + size / 2} L ${x + size} ${y} L ${x + size / 2} ${y + size} H ${x - size / 2} Z`,
    `M ${x} ${y - size} L ${x + size} ${y - size / 4} L ${x + size / 2} ${y + size} H ${x - size / 2} L ${x - size} ${y - size / 4} Z`,
    `M ${x} ${y - size} L ${x + size / 3} ${y - size / 3} L ${x + size} ${y} L ${x + size / 3} ${y + size / 3} L ${x} ${y + size} L ${x - size / 3} ${y + size / 3} L ${x - size} ${y} L ${x - size / 3} ${y - size / 3} Z`,
  ];
  return <Path d={paths[shape - 2]} fill={fill} stroke={color} strokeWidth={1.5} />;
}

export function CategoryMarker({ markerIndex, color }: { markerIndex: number; color: string }) {
  return <Svg width={12} height={12} accessible={false}><CategoryPoint markerIndex={markerIndex} color={color} /></Svg>;
}
