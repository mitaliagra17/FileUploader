const MAX_ALLOWED_FILE_SIZE = '52428800';

        function uploadContentVersion(recordId, filename, filecontent) {
            
            if (filecontent.length > MAX_ALLOWED_FILE_SIZE) {
                
                window.parent.postMessage(JSON.stringify({
                    status: 'error',
                    filename: filename,
                    message: 'File size too large'
                }), "*");
                return;  // Exit the function if the file size is too large
            }

            var contentVersion = new sforce.SObject('ContentVersion');

            contentVersion.Title = filename;
            contentVersion.PathOnClient = '/' + filename;
            contentVersion.FirstPublishLocationId = recordId;
            contentVersion.VersionData = filecontent;
            try {
                var results = sforce.connection.create([contentVersion]);
                for (var i = 0; i < results.length; i++) {
                    if (results[i].getBoolean("success")) {
                        // Send a message back to LWC with the new file information
                        window.parent.postMessage(JSON.stringify({
                            status: 'success',
                            fileId: results[i].id,
                            filename: filename
                        }), "*");
                    } else {
                        console.error(`Error uploading file: ${filename}`, e);
                        // Send an error message back to LWC when sforce.connection.create throws an error
                        window.parent.postMessage(JSON.stringify({
                            status: 'error',
                            filename: filename,
                            message: `Storage limit exceeded`
                        }), "*");
                    }
                }
            } catch (e) {
                console.error(`Error uploading file: ${filename}`, e);
                // Catch and send a storage limit error message back to LWC if any other error occurs
                window.parent.postMessage(JSON.stringify({
                    status: 'error',
                    filename: filename,
                    message: 'Storage limit exceeded'
                }), "*");
            }
        }

        window.addEventListener('message', (event) => {
            let fileName;
            try {
                const fileContent = JSON.parse(event.data);
                fileName = fileContent.Title;
                uploadContentVersion(fileContent.FirstPublishLocationId, fileContent.Title, fileContent.VersionData);
            } catch (e) {
                console.error('Error parsing message data:', e);
                // Send an error message back to LWC to handle parsing errors
                window.parent.postMessage(JSON.stringify({
                    status: 'error',
                    filename: fileName,
                    message: 'File size too large'
                }), "*");
            }
        });