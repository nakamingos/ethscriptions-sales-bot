# Use the latest stable Node.js 20.x version
FROM node:20

# Install required font packages and configurations
# These packages help with font rendering in our application
RUN apt-get update && apt-get install -y \
    fontconfig \
    fonts-liberation \
    libnss3 \
    libfontconfig1 \
    && rm -rf /var/lib/apt/lists/*

# Set up our application directory
WORKDIR /app

# Copy all application files to the container
COPY . .

# Install dependencies after cleaning any existing modules
RUN rm -rf node_modules \
    && yarn install

# Build the application for production
RUN yarn build

# Start the application in production mode
CMD ["yarn", "start:prod"]