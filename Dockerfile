# Start with the official Node.js image - specifying the exact version for consistency
FROM node:20.19.0

# Install required font packages and configurations
# We group these commands together to create a single Docker layer
RUN apt-get update && apt-get install -y \
    fontconfig \
    fonts-liberation \
    libnss3 \
    libfontconfig1 \
    && rm -rf /var/lib/apt/lists/*

# Set the working directory in the container
WORKDIR /app

# Copy the entire application first - this ensures we have all necessary files
COPY . .

# Install dependencies using yarn
# We remove any existing node_modules to ensure a clean install
RUN rm -rf node_modules \
    && yarn install

# Build the application
RUN yarn build

# Command to run the application
CMD ["yarn", "start:prod"]