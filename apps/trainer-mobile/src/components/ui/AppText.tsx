/**
 * The only `Text` the screens use.
 *
 * Its whole job is to cap OS font scaling. The design is a dense fixed-height phone layout;
 * at the largest accessibility text size an uncapped `Text` pushes every card past its
 * container and the dial numerals out of their ring. Capping at 1.3 keeps large-text settings
 * meaningfully useful while the layout still holds.
 */
import { forwardRef } from 'react';
import { Text, type TextProps } from 'react-native';

import { MAX_FONT_SCALE } from '../../theme/typography';

export type AppTextProps = TextProps;

export const AppText = forwardRef<Text, AppTextProps>(function AppText(props, ref) {
  return <Text ref={ref} maxFontSizeMultiplier={MAX_FONT_SCALE} {...props} />;
});
