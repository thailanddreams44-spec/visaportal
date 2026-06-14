FROM node:18-alpine

# Create app directory
WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy source
COPY . .

ENV NODE_ENV=production
EXPOSE 8080

CMD ["node", "server/app.js"]
