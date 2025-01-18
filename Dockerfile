# Start with the official Node.js image
FROM node:20

# Install required font packages and configurations
RUN apt-get update && apt-get install -y \
    fontconfig \
    fonts-liberation \
    libnss3 \
    libfontconfig1 \
    && rm -rf /var/lib/apt/lists/*

# Set the working directory
WORKDIR /app

# Copy package files
COPY package*.json yarn.lock ./

# Install dependencies
RUN yarn install --frozen-lockfile

# Copy the rest of the application
COPY . .

# Build the application
RUN yarn build

# Start the application
CMD ["yarn", "start:prod"]