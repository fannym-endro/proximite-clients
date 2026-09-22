/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Laisse le navigateur charger Google Fonts au runtime plutôt que de les
  // télécharger au build (évite une dépendance réseau à la compilation).
  optimizeFonts: false,
};

export default nextConfig;
