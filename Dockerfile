FROM node:18-slim

# 1. Instalacja zależności systemowych (Chrome/Puppeteer + Python/yt-dlp)
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    ffmpeg \
    curl \
    gnupg \
    wget \
    # Biblioteki wymagane przez Chrome (Puppeteer)
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libc6 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libexpat1 \
    libfontconfig1 \
    libgbm1 \
    libgcc1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libstdc++6 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    lsb-release \
    xdg-utils \
    && rm -rf /var/lib/apt/lists/*

# 2. Instalacja yt-dlp
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp
RUN chmod a+rx /usr/local/bin/yt-dlp

WORKDIR /app

# 3. Kopiowanie i instalacja zależności node
COPY package*.json ./
# Używamy --legacy-peer-deps, żeby uniknąć błędów konfliktów wersji
RUN npm install --legacy-peer-deps

# 4. Kopiowanie reszty plików
COPY . .

# 5. Budowanie aplikacji (tutaj Next.js użyje configu z Kroku 1 i zignoruje błędy TS)
RUN npm run build

# 6. Konfiguracja środowiska
ENV NODE_ENV=production
ENV PORT=3000
# Ścieżka dla Puppeteera w Dockerze (Chrome instaluje się z puppeteerem w node_modules)
# UWAGA: To jest trick - nie instalujemy chrome systemowo, używamy tego z node_modules,
# ale mamy biblioteki systemowe zainstalowane w pkt 1.

EXPOSE 3000

CMD ["npm", "start"]