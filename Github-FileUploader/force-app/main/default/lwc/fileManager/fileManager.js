import { LightningElement, api, wire } from 'lwc';
import { RefreshEvent } from 'lightning/refresh';
import { getRecord, getFieldValue, deleteRecord } from 'lightning/uiRecordApi';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import { getRelatedListRecords } from 'lightning/uiRelatedListApi';
import { refreshApex } from '@salesforce/apex';
import USER_NAME_FIELD from '@salesforce/schema/User.Name';

const CONTENT_DOCUMENT_FIELDS = [
    'ContentDocumentLink.ContentDocumentId',
    'ContentDocumentLink.ContentDocument.Title',
    'ContentDocumentLink.ContentDocument.ContentSize',
    'ContentDocumentLink.ContentDocument.CreatedById',
    'ContentDocumentLink.ContentDocument.CreatedBy.Name',
    'ContentDocumentLink.ContentDocument.FileExtension',
    'ContentDocumentLink.ContentDocument.CreatedDate',
    'ContentDocumentLink.ContentDocument.LatestPublishedVersionId'
];

export default class FileManager extends LightningElement {
    @api recordId;
    @api objectApiName;
    fileData = [];
    fileDataOriginal = [];
    filesToUpload = 0;
    uploadedFiles = 0; // Track the number of successfully uploaded files
    ownerId;
    ownerName;
    contentVersionId;
    fileUrl;
    wiredFilesResult;
    cardTitle;
    fileType;
    isLoading = false;
    sortBy;
    sortDirection;
    isDeleteModalOpen = false;
    fileToDelete = null; // Stores the file id to be deleted
    searchKey = '';
    currentFileIndex = 0;
    dataTableFiles = [];

    renderedCallback() {
        const STYLE = document.createElement('style');
        STYLE.innerText = `.slds-form-element__label{
        font-size: 13px;
        }`;
        this.template.querySelector('lightning-input').appendChild(STYLE);
    }


    handleSearch(event) {
        this.searchKey = event.target.value.toLowerCase();

        if (this.searchKey) {
            this.fileData = this.fileDataOriginal.filter((file) =>
                file.name.toLowerCase().includes(this.searchKey) ||
                file.type.toLowerCase().includes(this.searchKey)
            );
        }
        else {
            this.fileData = this.fileDataOriginal;
        }
    }


    get fileCardTitle() {
        return `Existing Files (${this.fileData.length || 0})`;
    }

    doSorting(event) {
        this.sortBy = event.detail.fieldName;
        this.sortDirection = event.detail.sortDirection;

        let parseData = JSON.parse(JSON.stringify(this.fileData));
        let keyValue = (a) => a[this.sortBy];
        let isReverse = this.sortDirection === 'asc' ? 1 : -1;

        parseData.sort((x, y) => {
            let valX = keyValue(x);
            let valY = keyValue(y);

            // Check if the value is a number (for size sorting)
            if (typeof valX === 'number' && typeof valY === 'number') {
                return isReverse * (valX - valY); // Numeric comparison for 'size'
            } else {
                // String comparison for other fields (file name, type, etc.)
                valX = valX ? valX.toLowerCase() : '';
                valY = valY ? valY.toLowerCase() : '';
                return isReverse * ((valX > valY) - (valY > valX));
            }
        });

        this.fileData = parseData;
    }


    handleRefresh() {
        this.dispatchEvent(new RefreshEvent());
    }

    // Use a getter to construct the fields array dynamically
    get fields() {
        return [`${this.objectApiName}.Name`, `${this.objectApiName}.OwnerId`];
    }

    // Fetch the record name dynamically using wire and dynamic field
    @wire(getRecord, { recordId: '$recordId', fields: '$fields' })
    wiredRecord({ error, data }) {
        if (data) {
            if (data.fields && data.fields.Name) {

                this.recordName = getFieldValue(data, `${this.objectApiName}.Name`);
                this.ownerId = getFieldValue(data, `${this.objectApiName}.OwnerId`);
                this.cardTitle = `Attach Files to ${this.objectApiName} - ${this.recordName}`;
            } else {
                console.error('Error: Record data or fields are not available.');
            }
        } else if (error) {
            console.error('Error retrieving record name:', error);
        }
    }

    // Fetch the owner data separately using the OwnerId obtained from the first wire
    @wire(getRecord, { recordId: '$ownerId', fields: [USER_NAME_FIELD] })
    wiredOwner({ error, data }) {

        if (data) {
            this.ownerName = getFieldValue(data, USER_NAME_FIELD);
        } else if (error) {
            console.error('Error retrieving owner name:', error);
        }
    }

    @wire(getRelatedListRecords, {
        parentRecordId: '$recordId',
        relatedListId: 'ContentDocumentLinks',
        fields: CONTENT_DOCUMENT_FIELDS
    })
    wiredFiles(result) {
        this.searchKey = '';
        this.wiredFilesResult = result;
        const { data, error } = result;
        if (data) {
            // Map the data from the wire call to extract necessary fields, including file size and CreatedBy.Name
            this.fileDataOriginal = data.records.map(file => {
                let contentDocument = file.fields.ContentDocument.value.fields;
                const fileType = contentDocument.FileExtension.value.toLowerCase();

                return {
                    id: file.fields.ContentDocumentId.value,
                    name: contentDocument.Title.value,
                    type: fileType,
                    size: contentDocument.ContentSize.value,
                    createdDate: contentDocument.CreatedDate.value,
                    createdBy: contentDocument.CreatedBy.value.fields.Name.value,
                    ContentVersionId: contentDocument.LatestPublishedVersionId.value,
                    thumbnailFileCard: `/sfc/servlet.shepherd/version/renditionDownload?rendition=THUMB720BY480&versionId=${file.fields.ContentDocumentId.value}
                                        &operationContext=CHATTER&contentId=${file.fields.ContentDocumentId.value}`,
                    downloadUrl: `/sfc/servlet.shepherd/document/download/${file.fields.ContentDocumentId.value}`,
                    icon: this.getIconName(fileType)
                };
            }).sort((a, b) => new Date(b.createdDate) - new Date(a.createdDate));

            // Copy the original data to fileData
            this.fileData = [...this.fileDataOriginal]; // Create a separate copy for filtering

        } else if (error) {
            this.dispatchEvent(
                new ShowToastEvent({
                    title: "Error loading Files",
                    message: error.body.message,
                    variant: "error"
                })
            );
        }
    }

    columns = [
        {
            label: 'File Name', fieldName: 'name',
            // type: 'customIconWithText',  // Custom type for icon and text combination
            cellAttributes: {
                iconName: { fieldName: 'icon' }  // Dynamically set the icon
            },
            sortable: "true"
        },
        { label: 'Type', fieldName: 'type', type: 'text', sortable: "true" },
        { label: 'Size (in bytes)', fieldName: 'size', type: 'text', sortable: "true" },
        { label: 'Created Date', fieldName: 'createdDate', type: 'date', sortable: "true" },
        { label: 'Created By', fieldName: 'createdBy', type: 'text', sortable: "true" },
        {
            label: 'Delete',
            type: 'button-icon',
            initialWidth: 75,
            typeAttributes: {
                iconName: 'utility:delete',
                name: 'delete',
                title: 'Delete',
                alternativeText: 'Delete',
                variant: 'border-filled',
                disabled: false
            }
        },
        {
            label: 'View File',
            type: 'button',
            typeAttributes: { label: 'View File', name: 'viewFile', variant: 'base' }
        }
    ];


    handleDragOver(event) {
        event.preventDefault();
        const dropZone = this.template.querySelector('.drop-zone');
        const dragText = this.template.querySelector('.drag-text');

        // Add highlight styles
        dropZone.classList.add('highlight');
        dragText.classList.add('text-highlight');
    }


    handleDragLeave(event) {
        event.preventDefault(); // Prevent default behavior

        const dropZone = this.template.querySelector('.drop-zone');
        const dragText = this.template.querySelector('.drag-text');

        // Remove highlight styles
        dropZone.classList.remove('highlight');
        dragText.classList.remove('text-highlight');
    }


    handleFileDrop(event) {
        event.preventDefault();
        const dropZone = this.template.querySelector('.drop-zone');
        const dragText = this.template.querySelector('.drag-text');

        // Remove highlight styles after drop
        dropZone.classList.remove('highlight');
        dragText.classList.remove('text-highlight');
        let files = event.dataTransfer.files;

        this.uploadFiles(files);
    }

    handleFileSelect(event) {
        const fileInput = this.template.querySelector('.hidden-input');
        if (fileInput) {
            // Trigger file input click on Enter key press
            document.addEventListener('keydown', (event) => {
                if (event.key === 'Enter') {
                    fileInput.click();
                }
            });
            fileInput.click();

            // Make the onchange event handler async
            fileInput.onchange = async (event) => {
                const files = event.target.files;
                if (files.length > 0) {
                    const filesArray = Array.from(files); // Convert to array if multiple files
                    await this.uploadFiles(filesArray);  // Call uploadFiles when files are selected
                }
            };
        } else {
            console.error('fileInput not found');
        }
    }




    failedFiles = [];
    storageLimitFiles = [];
    processedFiles = 0;  // Track the number of processed files (both success and failure)

    connectedCallback() {
        // Listen for messages from the VF page
        window.addEventListener('message', (event) => {
            try {
                const messageData = JSON.parse(event.data);
                if (messageData.status === 'success') {
                    this.uploadedFiles++;
                    this.processedFiles++;
                    // Refresh Apex to update the datatable
                    this.refreshDataTable();
                    this.handleRefresh();
                } else if (messageData.status === 'error') {
                    console.error('Error from VF page:', messageData.message);

                    if (messageData.message === 'File size too large') {
                        this.failedFiles.push(messageData.filename);
                    } else if (messageData.message === 'Storage limit exceeded') {
                        this.storageLimitFiles.push(messageData.filename);
                    }
                    this.processedFiles++;
                }

                // Check if all files have been processed
                if (this.processedFiles === this.filesToUpload) {
                    this.completeUploadProcess();
                }

            } catch (e) {
                console.error('Error parsing VF page message:', e);
                this.failedFiles.push('Unknown Error');
                this.processedFiles++;

                // Check if all files have been processed
                if (this.processedFiles === this.filesToUpload) {
                    this.completeUploadProcess();
                }
            }
        });
    }


    completeUploadProcess() {
        if (this.failedFiles.length > 0) {
            const failedFileList = this.failedFiles.join(', ');

            this.dispatchEvent(
                new ShowToastEvent({
                    title: 'File size too large',
                    message: `Failed to upload the following files: ${failedFileList}`,
                    variant: 'error',
                })
            );

        }

        // Handle files that failed due to storage limit
        if (this.storageLimitFiles.length > 0) {
            const storageLimitFileList = this.storageLimitFiles.join(', ');

            this.dispatchEvent(
                new ShowToastEvent({
                    title: 'Storage limit exceeded',
                    message: `Failed to upload the following files due to storage limit: ${storageLimitFileList}`,
                    variant: 'error',
                })
            );
        }

        this.isLoading = false;  // Reset loading spinner
        this.template.querySelector('[data-id="uploadFrame"]').src += '';  // Reload Iframe

        // Reset the state for the next upload
        this.resetState();
    }

    resetState() {
        this.failedFiles = [];
        this.storageLimitFiles = [];
        this.uploadedFiles = 0;
        this.processedFiles = 0;
        this.filesToUpload = 0;
    }


    refreshDataTable() {
        // Use refreshApex to refresh the datatable
        refreshApex(this.wiredFilesResult).then(() => {
        }).catch((error) => {
            console.error('Error refreshing datatable:', error);
        });
    }


    toBase64 = file => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => {
            let result = reader.result;
            let base64 = 'base64,';
            let content = result.indexOf(base64) + base64.length;
            let fileContents = result.substring(content);
            resolve(fileContents);
        };
        reader.onerror = error => reject(error);
    });


    // Upload files method
    async uploadFiles(files) {
        this.resetState();

        this.filesToUpload = files.length;
        this.uploadedFiles = 0;
        this.isLoading = true;

        for (let i = 0; i < files.length; i++) {
            // Convert each file to Base64 before uploading
            const base64Content = await this.toBase64(files[i]);

            const fileContent = {
                Title: files[i].name,
                VersionData: base64Content,
                FirstPublishLocationId: this.recordId,
                PathOnClient: files[i].name
            };
            // Post message to the VF page iframe
            this.openVFPage(fileContent);
        }
    }


    openVFPage(fileContent) {
        const iframe = this.template.querySelector('[data-id="uploadFrame"]');

        if (iframe) {
            iframe.contentWindow.postMessage(JSON.stringify(fileContent), '*');
        } else {
            console.error('Iframe not found');
        }
    }


    handleRowAction(event) {
        const actionName = event.detail.action.name;
        const row = event.detail.row;

        if (actionName === 'viewFile') {
            this.contentVersionId = row.ContentVersionId;
            this.fileUrl = row.downloadUrl;
            this.fileType = row.type;

            // Get the file list and current file index
            this.dataTableFiles = this.fileData;
            this.currentFileIndex = this.dataTableFiles.findIndex(file => file.ContentVersionId === row.ContentVersionId);

            this.openPreviewModal();
        } else if (actionName === 'delete') {
            this.fileToDelete = row.id;
            this.isDeleteModalOpen = true;
        }
    }

    // Close the delete modal
    closeDeleteModal() {
        this.isDeleteModalOpen = false;
        this.fileToDelete = null; // Clear file id when closing modal
    }

    confirmDelete() {
        if (this.fileToDelete) {
            this.handleDelete(this.fileToDelete);
        }
        this.isDeleteModalOpen = false;
    }


    handleDelete(recordId) {
        deleteRecord(recordId)
            .then(() => {
                this.fileData = this.fileData.filter(file => file.id !== recordId);
                refreshApex(this.wiredFilesResult)
                    .then(() => {
                        this.dispatchEvent(
                            new ShowToastEvent({
                                title: 'Success',
                                message: 'File deleted successfully',
                                variant: 'success',
                            })
                        );
                        this.handleRefresh();
                    })
            })
            .catch(error => {
                this.dispatchEvent(
                    new ShowToastEvent({
                        title: 'Error deleting file',
                        message: error.body.message || 'An unknown error occurred',
                        variant: 'error',
                    })
                );
            });
    }


    getIconName(fileType) {
        switch (fileType) {
            case "pdf":
                return "doctype:pdf";
            case "ppt":
                return "doctype:ppt";
            case "pptx":
                return "doctype:ppt";
            case "xls":
                return "doctype:excel";
            case "xlsx":
                return "doctype:excel";
            case "csv":
                return "doctype:csv";
            case "txt":
                return "doctype:txt";
            case "xml":
                return "doctype:xml";
            case "doc":
                return "doctype:word";
            case "docx":
                return "doctype:word";
            case "zip":
                return "doctype:zip";
            case "rtf":
                return "doctype:rtf";
            case "psd":
                return "doctype:psd";
            case "html":
                return "doctype:html";
            case "gdoc":
                return "doctype:gdoc";
            case "vis":
                return "doctype:visio";
            case "pgs":
                return "doctype:pages";
            case "key":
                return "doctype:keynote";
            case "fla":
                return "doctype:flash";
            case "exe":
                return "doctype:exe";
            case "eps":
                return "doctype:eps";
            case "mp3":
                return "doctype:audio";
            case "ai":
                return "doctype:ai";
            case "wmv":
                return "doctype:video";
            case "avi":
                return "doctype:video";
            case "mov":
                return "doctype:video";
            case "mp4":
                return "doctype:mp4";
            case "tiff":
                return "doctype:image";
            case "bmp":
                return "doctype:image";
            case "gif":
                return "doctype:image";
            case "svg":
                return "doctype:image";
            case "png":
                return "doctype:image";
            case "jpeg":
                return "doctype:image";
            case "jpg":
                return "doctype:image";
            default:
                return "doctype:unknown";
        }
    }

    openPreviewModal() {
        const previewModal = this.template.querySelector('c-preview-file-modal');
        if (previewModal) {
            previewModal.show(this.fileUrl, this.fileType, this.currentFileIndex, this.dataTableFiles);
        } else {
            console.error('Preview modal component not found.');
        }
    }
}