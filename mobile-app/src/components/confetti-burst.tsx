import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';

type Piece = { dx: number; rise: number; fall: number; spin: number; delay: number; size: number; color: string; round: boolean };

function makePieces(colors: string[], count: number): Piece[] {
  return Array.from({ length: count }, (_, index) => ({
    dx: (Math.random() - 0.5) * 320,
    rise: 80 + Math.random() * 120,
    fall: 220 + Math.random() * 160,
    spin: (Math.random() - 0.5) * 720,
    delay: Math.random() * 120,
    size: 6 + Math.random() * 5,
    color: colors[index % colors.length],
    round: index % 3 === 0,
  }));
}

export function ConfettiBurst({ colors, count = 28, onDone }: { colors: string[]; count?: number; onDone?(): void }) {
  const reducedMotion = useReducedMotion();
  const [pieces] = useState(() => makePieces(colors, count));
  useEffect(() => {
    const timer = setTimeout(() => onDone?.(), reducedMotion ? 0 : 1600);
    return () => clearTimeout(timer);
  }, [onDone, reducedMotion]);
  if (reducedMotion) return null;
  return <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center', overflow: 'visible' }]}>
    {pieces.map((piece, index) => <ConfettiPiece key={index} piece={piece} />)}
  </View>;
}

function ConfettiPiece({ piece }: { piece: Piece }) {
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.set(withDelay(piece.delay, withTiming(1, { duration: 1300, easing: Easing.out(Easing.quad) })));
  }, [piece.delay, progress]);
  const style = useAnimatedStyle(() => {
    const t = progress.value;
    return {
      opacity: t < 0.75 ? 1 : 1 - (t - 0.75) / 0.25,
      transform: [
        { translateX: piece.dx * t },
        { translateY: -piece.rise * Math.sin(Math.PI * Math.min(t * 1.6, 1) / 2) + piece.fall * t * t },
        { rotate: `${piece.spin * t}deg` },
      ],
    };
  });
  return <Animated.View style={[{ position: 'absolute', width: piece.size, height: piece.round ? piece.size : piece.size * 0.45, borderRadius: piece.round ? piece.size / 2 : 1, backgroundColor: piece.color }, style]} />;
}
