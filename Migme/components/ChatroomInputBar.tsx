import { useRef, useState } from 'react';
import type { MutableRefObject, RefObject } from 'react';
import {
  Keyboard,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  TextInputContentSizeChangeEventData,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme, type AppTheme } from '../services/themeContext';

interface Props {
  inputRef: RefObject<TextInput | null>;
  inputText: string;
  inputTextRef: MutableRefObject<string>;
  onChangeInputText: (text: string) => void;
  onOpenPicker: () => void;
  onOpenEmoticon: () => void;
  onSendMessage: () => void;
}

function makePalette(appTheme: AppTheme) {
  return {
    dropBg:      appTheme.cardBg,
    inputBg:     appTheme.inputBg,
    inputBorder: appTheme.border,
    text:        appTheme.textPrimary,
    ts:          appTheme.textSecondary,
  };
}

export default function ChatroomInputBar({
  inputRef,
  inputText,
  inputTextRef,
  onChangeInputText,
  onOpenPicker,
  onOpenEmoticon,
  onSendMessage,
}: Props) {
  const insets = useSafeAreaInsets();
  const C = makePalette(useAppTheme());
  const styles = makeStyles(C);
  const [inputHeight, setInputHeight] = useState(36);
  const sendLockRef = useRef(false);

  const handleContentSizeChange = (event: NativeSyntheticEvent<TextInputContentSizeChangeEventData>) => {
    const nextHeight = Math.min(Math.max(36, event.nativeEvent.contentSize.height), 100);
    setInputHeight(nextHeight);
  };

  const sendAndDismiss = () => {
    if (sendLockRef.current) return;
    if (!inputTextRef.current.trim()) return;
    sendLockRef.current = true;
    onSendMessage();
    setInputHeight(36);
    inputRef.current?.blur();
    Keyboard.dismiss();
    setTimeout(() => {
      sendLockRef.current = false;
    }, 180);
  };

  const hasText = inputText.trim().length > 0;

  return (
    <View
      style={[
        styles.wrapper,
        { paddingBottom: insets.bottom > 0 ? insets.bottom : 8 },
      ]}
    >
      <View style={styles.inputBar}>
        <TouchableOpacity
          style={styles.iconBtn}
          onPress={onOpenPicker}
          testID="button-gift"
          activeOpacity={0.75}
        >
          <View style={[styles.iconCircle, { backgroundColor: '#FF6B8A' }]}>
            <Ionicons name="gift" size={17} color="#FFFFFF" />
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.iconBtn}
          onPress={onOpenEmoticon}
          testID="button-emoticon"
          activeOpacity={0.75}
        >
          <View style={[styles.iconCircle, { backgroundColor: '#FFB830' }]}>
            <Ionicons name="happy" size={17} color="#FFFFFF" />
          </View>
        </TouchableOpacity>

        <View style={styles.inputWrap}>
          <TextInput
            ref={inputRef}
            style={[styles.input, { height: inputHeight }]}
            placeholder="Ketik pesan..."
            placeholderTextColor={C.ts}
            value={inputText}
            onChangeText={(text) => {
              inputTextRef.current = text;
              onChangeInputText(text);
            }}
            multiline
            returnKeyType="send"
            blurOnSubmit={false}
            textAlignVertical="top"
            scrollEnabled={inputHeight >= 100}
            onContentSizeChange={handleContentSizeChange}
            onSubmitEditing={sendAndDismiss}
            testID="input-message"
          />
        </View>

        <Pressable
          style={[styles.sendCircle, { backgroundColor: hasText ? '#07C160' : '#D0D0D0' }]}
          onTouchStart={sendAndDismiss}
          onPressIn={sendAndDismiss}
          android_ripple={null}
          testID="button-send"
        >
          <Ionicons name="paper-plane" size={16} color="#FFFFFF" style={styles.sendIcon} />
        </Pressable>
      </View>
    </View>
  );
}

const makeStyles = (C: ReturnType<typeof makePalette>) => StyleSheet.create({
  wrapper: {
    backgroundColor: C.dropBg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.inputBorder,
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.dropBg,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 8,
  },
  iconBtn: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 2,
  },
  inputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.inputBg,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 2,
    minHeight: 36,
    maxHeight: 100,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.inputBorder,
  },
  input: {
    flex: 1,
    fontSize: 14,
    color: C.text,
    maxHeight: 100,
    minHeight: 36,
    paddingVertical: Platform.OS === 'ios' ? 8 : 6,
    paddingLeft: 0,
    fontFamily: 'Roboto_400Regular',
  },
  sendCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#07C160',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 3,
  },
  sendIcon: {
    marginLeft: 1,
  },
});
