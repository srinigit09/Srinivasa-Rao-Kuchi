// metro.config.js
// Optimizes bundle size by excluding unused icon font files from @expo/vector-icons.
// The app only uses Ionicons — all other font sets are excluded from the APK.

const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Block all vector-icon font files except Ionicons.ttf
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
  // If requesting one of the unused icon fonts, return an empty module
  if (moduleName && UNUSED_FONTS.some(f => moduleName.endsWith(f))) {
    return { type: 'empty' };
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
