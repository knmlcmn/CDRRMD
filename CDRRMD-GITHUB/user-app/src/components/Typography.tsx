import { createContext, useContext, type ReactNode } from 'react';
import { StyleSheet, Text as NativeText, TextInput as NativeTextInput, type TextProps, type TextInputProps } from 'react-native';
import { useFonts } from 'expo-font';
import { Sora_400Regular } from '@expo-google-fonts/sora/400Regular';
import { Sora_600SemiBold } from '@expo-google-fonts/sora/600SemiBold';
import { Sora_700Bold } from '@expo-google-fonts/sora/700Bold';
import { Sora_800ExtraBold } from '@expo-google-fonts/sora/800ExtraBold';

const FontContext = createContext(false);
const FontFamilyContext = createContext<string | undefined>(undefined);
export const EDITORIAL_FONT = 'Sora_400Regular';

export function TypographyProvider({ children }: { children: ReactNode }) {
  const [loaded] = useFonts({
    Sora_400Regular,
    Sora_600SemiBold,
    Sora_700Bold,
    Sora_800ExtraBold,
  });

  return <FontContext.Provider value={loaded}>{children}</FontContext.Provider>;
}

export function TypographyFamily({ children, family }: { children: ReactNode; family: string }) {
  return <FontFamilyContext.Provider value={family}>{children}</FontFamilyContext.Provider>;
}

function fontForText(style: TextProps['style']) {
  const flattened = StyleSheet.flatten(style);
  const weight = flattened?.fontWeight === 'bold' ? 700 : Number(flattened?.fontWeight || 400);
  if (weight >= 800) return 'Sora_800ExtraBold';
  if (weight >= 700) return 'Sora_700Bold';
  if (weight >= 600) return 'Sora_600SemiBold';
  return 'Sora_400Regular';
}

export function AppText({ style, ...props }: TextProps) {
  const fontsLoaded = useContext(FontContext);
  const scopedFamily = useContext(FontFamilyContext);
  const family = scopedFamily ?? fontForText(style);
  return (
    <NativeText
      {...props}
      style={[style, fontsLoaded ? { fontFamily: family, fontWeight: 'normal' } : undefined]}
    />
  );
}

export function AppTextInput({ style, ...props }: TextInputProps) {
  const fontsLoaded = useContext(FontContext);
  return (
    <NativeTextInput
      {...props}
      style={[style, fontsLoaded ? { fontFamily: EDITORIAL_FONT } : undefined]}
    />
  );
}
