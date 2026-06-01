import { Image, ImageSourcePropType, StyleSheet, Text, View } from 'react-native';
import { parseMessageWithEmoticons } from '../constants/emoticons';
import { useFontSize } from '../services/fontSizeContext';

const EMOTE_SIZE      = 18;
const GAME_CARD_SIZE  = 64;

// Key prefixes yang dianggap "game card" — ditampilkan lebih besar
const GAME_CARD_PREFIXES = ['cr', 'd1','d2','d3','d4','d5','d6', 'lc_', 'uno_'];

function isGameCard(key: string): boolean {
  return GAME_CARD_PREFIXES.some(p => key.startsWith(p));
}

interface Props {
  text: string;
  textStyle?: object;
  style?: object;
}

export default function EmoticonText({ text, textStyle, style }: Props) {
  const { fs } = useFontSize();
  const segments = parseMessageWithEmoticons(text);
  const dynamicTextStyle = { fontSize: fs(14) };

  const hasEmotes = segments.some(s => s.type === 'emote');

  if (!hasEmotes) {
    return <Text style={[styles.defaultText, dynamicTextStyle, textStyle]}>{text}</Text>;
  }

  return (
    <View style={[styles.row, style]}>
      {segments.map((seg, i) => {
        if (seg.type === 'emote') {
          const cardSize = isGameCard(seg.key) ? GAME_CARD_SIZE : EMOTE_SIZE;
          return (
            <Image
              key={i}
              source={seg.image as ImageSourcePropType}
              style={{ width: cardSize, height: cardSize, marginHorizontal: 2 }}
              resizeMode="contain"
              accessibilityLabel={seg.label}
            />
          );
        }
        if (!seg.content) return null;
        return (
          <Text key={i} style={[styles.defaultText, dynamicTextStyle, textStyle]}>
            {seg.content}
          </Text>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  defaultText: {
    fontSize: 14,
    color: '#212121',
  },
});
