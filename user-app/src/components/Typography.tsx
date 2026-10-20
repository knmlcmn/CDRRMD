import { createContext, useContext, type ReactNode } from 'react';
import { StyleSheet, Text as NativeText, TextInput as NativeTextInput, type TextProps, type TextInputProps } from 'react-native';
import { useFonts } from 'expo-font';
import { Sora_400Regular } from '@expo-google-fonts/sora/400Regular';
import { Sora_600SemiBold } from '@expo-google-fonts/sora/600SemiBold';
import { Sora_700Bold } from '@expo-google-fonts/sora/700Bold';
import { Sora_800ExtraBold } from '@expo-google-fonts/sora/800ExtraBold';
import { Manrope_400Regular } from '@expo-google-fonts/manrope/400Regular';
import { Manrope_600SemiBold } from '@expo-google-fonts/manrope/600SemiBold';
import { Manrope_700Bold } from '@expo-google-fonts/manrope/700Bold';
import { Manrope_800ExtraBold } from '@expo-google-fonts/manrope/800ExtraBold';

const FontContext = createContext(false);
const FontFamilyContext = createContext<string | undefined>(undefined);
export const EDITORIAL_FONT = 'Sora_400Regular';

export function TypographyProvider({ children }: { children: ReactNode }) {
  const [loaded] = useFonts({
    Sora_400Regular,
    Sora_600SemiBold,
    Sora_700Bold,
    Sora_800ExtraBold,
    Manrope_400Regular,
    Manrope_600SemiBold,
    Manrope_700Bold,
    Manrope_800ExtraBold,
  });

  return <FontContext.Provider value={loaded}>{children}</FontContext.Provider>;
}

export function TypographyFamily({ children, family }: { children: ReactNode; family: string }) {
  return <FontFamilyContext.Provider value={family}>{children}</FontFamilyContext.Provider>;
}

function fontForText(style: TextProps['style'], family: 'Sora' | 'Manrope' = 'Sora') {
  const flattened = StyleSheet.flatten(style);
  const weight = flattened?.fontWeight === 'bold' ? 700 : Number(flattened?.fontWeight || 400);
  if (family === 'Manrope') {
    if (weight >= 800) return 'Manrope_800ExtraBold';
    if (weight >= 700) return 'Manrope_700Bold';
    if (weight >= 600) return 'Manrope_600SemiBold';
    return 'Manrope_400Regular';
  }
  if (weight >= 800) return 'Sora_800ExtraBold';
  if (weight >= 700) return 'Sora_700Bold';
  if (weight >= 600) return 'Sora_600SemiBold';
  return 'Sora_400Regular';
}

export function AppText({ style, ...props }: TextProps) {
  const fontsLoaded = useContext(FontContext);
  const scopedFamily = useContext(FontFamilyContext);
  const family = scopedFamily === 'Manrope' ? fontForText(style, 'Manrope') : scopedFamily ?? fontForText(style);
  return (
    <NativeText
      {...props}
      style={[style, fontsLoaded ? { fontFamily: family, fontWeight: 'normal' } : undefined]}
    />
  );
}

export function AppTextInput({ style, ...props }: TextInputProps) {
  const fontsLoaded = useContext(FontContext);
  const scopedFamily = useContext(FontFamilyContext);
  return (
    <NativeTextInput
      {...props}
      style={[style, fontsLoaded ? { fontFamily: scopedFamily === 'Manrope' ? 'Manrope_400Regular' : EDITORIAL_FONT } : undefined]}
    />
  );
}
