FROM debian:bookworm-slim

# Prevents apt from prompting for input during automated builds
ENV DEBIAN_FRONTEND=noninteractive

# System deps + all conversion engine runtimes/binaries in one layer,
# then clean up apt cache to keep image size down
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    gnupg \
    nodejs \
    npm \
    python3 \
    python3-pip \
    ruby \
    ruby-dev \
    pandoc \
    libreoffice \
    tesseract-ocr \
    p7zip-full \
    qpdf \
    texlive-latex-base \
    texlive-latex-extra \
    texlive-fonts-recommended \
    && rm -rf /var/lib/apt/lists/*

# Python/Ruby language-package-manager installs (separate layer from apt
# for caching/debugging clarity — these aren't apt packages)
RUN pip3 install --no-cache-dir --break-system-packages nbconvert \
    && gem install asciidoctor --no-document

WORKDIR /app

# Copy and install server dependencies first (better layer caching —
# this layer only rebuilds when package.json actually changes)
COPY server/package*.json ./
RUN npm install --omit=dev

# Copy the rest of the server source
COPY server/ ./

EXPOSE 4000

CMD ["node", "index.js"]