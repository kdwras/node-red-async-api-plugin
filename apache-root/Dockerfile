# Use official PHP-Apache image
FROM php:7.3-apache

# Enable mod_rewrite for Apache
RUN a2enmod rewrite

# Set working directory to /var/www/html
WORKDIR /var/www/html

# Copy all files from apache-root to Apache's web root
COPY . /var/www/html/

# Set proper permissions
RUN chown -R www-data:www-data /var/www/html

# Expose port 80
EXPOSE 80
