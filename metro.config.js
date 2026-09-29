// metro.config.js
// Blocks all @expo/vector-icons font files except Ionicons.ttf
// (only icon set used in this app). Saves ~3.5MB from the APK bundle.

const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

const UNUSED_FONTS = [
  'AntDesign.ttf',
  'Entypo.ttf',
  'EvilIcons.ttf',
  'Feather.ttf',
  'FontAwesome.ttf',
  'FontAwesome5_Brands.ttf',
  'FontAwesome5_Regular.ttf',
  'FontAwesome5_Solid.ttf',
  'FontAwesome6_Brands.ttf',
  'FontAwesome6_Regular.ttf',
  'FontAwesome6_Solid.ttf',
  'Fontisto.ttf',
  'Foundation.ttf',
  'MaterialCommunityIcons.ttf',
  'MaterialIcons.ttf',
  'Octicons.ttf',
  'SimpleLineIcons.ttf',
  'Zocial.ttf',
];

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName && UNUSED_FONTS.some(f => moduleName.endsWith(f))) {
    return { type: 'empty' };
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
