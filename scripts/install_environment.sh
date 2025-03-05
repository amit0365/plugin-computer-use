#!/usr/bin/env bash
set -e

# Prevent apt-get from asking interactive questions
export DEBIAN_FRONTEND=noninteractive
export DEBIAN_PRIORITY=critical

echo "[INFO] Updating package lists..."
sudo apt-get update -y

echo "[INFO] Running dist-upgrade to ensure all packages can be upgraded..."
sudo apt-get -y dist-upgrade \
  -o Dpkg::Options::="--force-confdef" \
  -o Dpkg::Options::="--force-confold"

echo "[INFO] Installing required packages..."
sudo apt-get install -y \
    xvfb \
    xterm \
    xdotool \
    scrot \
    imagemagick \
    sudo \
    mutter \
    x11vnc \
    build-essential \
    libssl-dev \
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
    net-tools \
    netcat \
    software-properties-common \
    unzip

echo "[INFO] Adding Mozilla PPA and installing additional apps..."
sudo add-apt-repository -y ppa:mozillateam/ppa
sudo apt-get update -y
sudo apt-get install -y --no-install-recommends \
    libreoffice \
    firefox-esr \
    x11-apps \
    xpdf \
    gedit \
    xpaint \
    tint2 \
    galculator \
    pcmanfm

echo "[INFO] Cleaning up..."
sudo apt-get clean

echo "[INFO] Installation script complete."
