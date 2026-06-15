import { forwardRef, useImperativeHandle, useState } from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';

type PagerViewProps = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  initialPage?: number;
  onPageSelected?: (event: { nativeEvent: { position: number } }) => void;
  scrollEnabled?: boolean;
};

export default forwardRef<{ setPage: (page: number) => void }, PagerViewProps>(function PlatformPagerView(
  { children, style, initialPage = 0, onPageSelected },
  ref,
) {
  const [page, setPageState] = useState(initialPage);
  const pages = Array.isArray(children) ? children : [children];

  useImperativeHandle(ref, () => ({
    setPage: (nextPage: number) => {
      setPageState(nextPage);
      onPageSelected?.({ nativeEvent: { position: nextPage } });
    },
  }));

  return (
    <View style={style}>
      {pages[page] ?? pages[0] ?? null}
    </View>
  );
});