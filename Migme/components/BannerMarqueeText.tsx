import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

interface Props {
  text:          string;
  containerWidth: number;
  style?:        object;
}

export default function BannerMarqueeText({ text, containerWidth, style }: Props) {
  const translateX  = useRef(new Animated.Value(0)).current;
  const [textWidth, setTextWidth] = useState(0);
  const animRef     = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    animRef.current?.stop();
    translateX.setValue(0);
  }, [text, translateX]);

  useEffect(() => {
    if (textWidth === 0 || containerWidth === 0) return;

    animRef.current?.stop();
    translateX.setValue(0);

    if (textWidth <= containerWidth) {
      return;
    }

    const scrollDistance = textWidth - containerWidth + 12;

    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(1200),
        Animated.timing(translateX, {
          toValue:        -scrollDistance,
          duration:       scrollDistance * 28,
          useNativeDriver: true,
        }),
        Animated.delay(800),
        Animated.timing(translateX, {
          toValue:         0,
          duration:        300,
          useNativeDriver: true,
        }),
      ]),
    );

    animRef.current = loop;
    loop.start();

    return () => loop.stop();
  }, [textWidth, containerWidth, translateX]);

  return (
    <View style={[st.clip, { width: containerWidth }]}>
      <Animated.Text
        style={[style, { transform: [{ translateX }] }]}
        numberOfLines={1}
        onLayout={e => setTextWidth(e.nativeEvent.layout.width)}
      >
        {text}
      </Animated.Text>
    </View>
  );
}

const st = StyleSheet.create({
  clip: {
    overflow: 'hidden',
  },
});
