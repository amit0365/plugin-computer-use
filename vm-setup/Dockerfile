# Use Ubuntu 22.04 base
FROM docker.io/ubuntu:22.04

# Avoid interactive prompts
ENV DEBIAN_FRONTEND=noninteractive
ENV DEBIAN_PRIORITY=high

# Use bash for RUN so we can source nvm in the same layer
SHELL ["/bin/bash", "-c"]

###############################################################################
# 1) System packages & minimal desktop environment tools
###############################################################################
RUN apt-get update && \
    apt-get -y upgrade && \
    apt-get install -y \
    # UI Requirements
    xvfb \
    xterm \
    xdotool \
    scrot \
    imagemagick \
    sudo \
    mutter \
    x11vnc \
    # Python/pyenv reqs
    build-essential \
    libssl-dev  \
    zlib1g-dev \
    libbz2-dev \
    libreadline-dev \
    libsqlite3-dev \
    curl \
    git \
    libncursesw5-dev \
    xz-utils \
    tk-dev \
    libxml2-dev \
    libxmlsec1-dev \
    libffi-dev \
    liblzma-dev \
    # Network tools
    net-tools \
    netcat \
    # PPA req
    software-properties-common && \
    # Userland apps
    sudo add-apt-repository ppa:mozillateam/ppa && \
    sudo apt-get install -y --no-install-recommends \
    libreoffice \
    firefox-esr \
    x11-apps \
    xpdf \
    gedit \
    xpaint \
    tint2 \
    galculator \
    pcmanfm \
    unzip && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

###############################################################################
# 2) Install noVNC
###############################################################################
RUN git clone --branch v1.5.0 https://github.com/novnc/noVNC.git /opt/noVNC && \
    git clone --branch v0.12.0 https://github.com/novnc/websockify /opt/noVNC/utils/websockify && \
    ln -s /opt/noVNC/vnc.html /opt/noVNC/index.html

###############################################################################
# 3) Create non-root user "computeruse"
###############################################################################
RUN useradd -ms /bin/bash -d /home/computeruse computeruse && \
    echo "computeruse ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers

ENV USERNAME=computeruse
ENV HOME=/home/computeruse

USER $USERNAME
WORKDIR /home/computeruse

###############################################################################
# 4) Install NVM + Node + pnpm as user
###############################################################################
ENV NVM_DIR=/home/computeruse/.nvm
ENV NODE_VERSION=23.3.0

RUN git clone https://github.com/nvm-sh/nvm.git "$NVM_DIR" && \
    cd "$NVM_DIR" && git checkout v0.39.3 && \
    . "$NVM_DIR/nvm.sh" && \
    nvm install "$NODE_VERSION" && \
    nvm alias default "$NODE_VERSION" && \
    nvm use default && \
    npm install -g pnpm@9.15.4

ENV PATH="$NVM_DIR/versions/node/v${NODE_VERSION}/bin:$PATH"

###############################################################################
# 5) Clone & build Eliza (develop branch)
###############################################################################
# Use a token or SSH if needed, but here's the HTTP approach:
ADD https://api.github.com/repos/amit0365/eliza/git/refs/heads/develop version.json
RUN git clone -b develop https://github.com/amit0365/eliza.git eliza && \
    cd eliza && git pull

WORKDIR /home/computeruse/eliza/packages/plugin-anthropic-computer-use
RUN pnpm install
RUN pnpm build

###############################################################################
# 6) Copy .env and build main Eliza
###############################################################################
WORKDIR /home/computeruse/eliza
RUN cp .env.example .env
RUN pnpm install
RUN pnpm build

###############################################################################
# 7) Copy updated start.sh
###############################################################################
COPY --chown=computeruse:computeruse .config/ /home/computeruse/.config/
COPY --chown=computeruse:computeruse start.sh /home/computeruse/start.sh
RUN chmod +x /home/computeruse/start.sh

###############################################################################
# Expose needed ports
###############################################################################
EXPOSE 8080 5173 3000

###############################################################################
# 8) Final: run start.sh
###############################################################################
WORKDIR /home/computeruse
CMD ["./start.sh"]
