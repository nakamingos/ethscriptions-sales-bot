FROM node:20

# Install required font packages and configurations
RUN apt-get update && apt-get install -y \
    fontconfig \
    fonts-liberation \
    libnss3 \
    libfontconfig1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files first
COPY package*.json yarn.lock ./

# Install dependencies
RUN rm -rf node_modules \
    && yarn install

# Now copy the rest of the application
COPY . .

# Build the application
RUN yarn build

# This ensures we don't try to run tests or other commands that might need env vars during build
ENV NODE_ENV=production

# The CMD will run when the container starts, when env vars are available
CMD ["yarn", "start:prod"]