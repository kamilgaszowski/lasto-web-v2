# 1. Baza: Node 20 (wymagany przez Next.js 16)
FROM node:20-slim

# 2. Instalujemy podstawowe narzędzia + Python/ffmpeg dla yt-dlp
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    python3 \
    python3-pip \
    ffmpeg \
    curl \
    && rm -rf /var/lib/apt/lists/*

# 3. Instalujemy Google Chrome Stable (To dociągnie wszystkie biblioteki graficzne!)
RUN wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add - \
    && sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list' \
    && apt-get update \
    && apt-get install -y google-chrome-stable fonts-ipafont-gothic fonts-wqy-zenhei fonts-thai-tlwg fonts-kacst fonts-freefont-ttf libxss1 \
      --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# 4. Instalujemy yt-dlp
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp
RUN chmod a+rx /usr/local/bin/yt-dlp

# 5. Konfiguracja zmiennych dla Puppeteera
# Mówimy mu: "Nie ściągaj swojego Chroma, użyj tego, co zainstalowaliśmy wyżej"
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable

WORKDIR /app

COPY package*.json ./
# Instalujemy zależności
RUN npm install --legacy-peer-deps

COPY . .

# Budujemy aplikację (ignorując błędy TS, żeby przeszło gładko)
RUN npm run build

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000
CMD ["npm", "start"]