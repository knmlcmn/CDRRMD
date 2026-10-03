import { createContext, useContext, type ReactNode } from 'react';
import { Platform, StyleSheet, Text as NativeText, TextInput as NativeTextInput, type TextProps, type TextInputProps } from 'react-native';
import { useFonts } from 'expo-font';
import { Manrope_400Regular } from '@expo-google-fonts/manrope/400Regular';
import { Manrope_800ExtraBold } from '@expo-google-fonts/manrope/800ExtraBold';

const FontContext = createContext(false);
const FontFamilyContext = createContext<string | undefined>(undefined);
export const EDITORIAL_FONT = Platform.select({ ios: 'Georgia', android: 'serif', default: 'Georgia' }) ?? 'Georgia';

export function TypographyProvider({ children }: { children: ReactNode }) {
  const [loaded] = useFonts({
    Manrope_400Regular,
    Manrope_800ExtraBold,
  });

  return <FontContext.Provider value={loaded}>{children}</FontContext.Provider>;
}

export function TypographyFamily({ children, family }: { children: ReactNode; family: string }) {
  return <FontFamilyContext.Provider value={family}>{children}</FontFamilyContext.Provider>;
}

function fontForText(style: TextProps['style']) {
  const flattened = StyleSheet.flatten(style);
  if (flattened?.fontFamily) return flattened.fontFamily;
  return EDITORIAL_FONT;
}

export function AppText({ style, ...props }: TextProps) {
  const fontsLoaded = useContext(FontContext);
  const scopedFamily = useContext(FontFamilyContext);
  const family = scopedFamily ?? fontForText(style);
  return (
    <NativeText
      {...props}
      style={[style, family === EDITORIAL_FONT ? { fontFamily: family } : fontsLoaded ? { fontFamily: family, fontWeight: 'normal' } : undefined]}
    />
  );
}

export function AppTextInput({ style, ...props }: TextInputProps) {
  return (
    <NativeTextInput
      {...props}
      style={[style, { fontFamily: EDITORIAL_FONT }]}
    />
  );
}
