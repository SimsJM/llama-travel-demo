FROM node:22-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY index.js setup-catalog.js ./

# Don't run the app as root.
USER node

EXPOSE 4242

CMD ["node", "index.js"]
