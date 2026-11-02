import { useState } from 'react';
import { RefreshControl, type RefreshControlProps } from 'react-native';

/** Reveal the native refresh inset only for an explicit pull gesture. */
export function PullRefreshControl({ refreshing, onRefresh, ...props }: RefreshControlProps) {
  const [pulled, setPulled] = useState(false);
  const [wasRefreshing, setWasRefreshing] = useState(refreshing);
  if (wasRefreshing !== refreshing) {
    setWasRefreshing(refreshing);
    if (!refreshing) setPulled(false);
  }

  return <RefreshControl {...props} refreshing={pulled && refreshing} onRefresh={() => {
    setPulled(true);
    onRefresh?.();
  }} />;
}
