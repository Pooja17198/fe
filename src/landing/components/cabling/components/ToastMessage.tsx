import { useEffect, useState } from 'preact/hooks';

import 'oj-c/message-toast';
import { MessageToastItem } from 'oj-c/message-toast';
import { MessageToastIntrinsicProps } from 'oj-c/message-toast/message-toast';
import ArrayDataProvider from 'ojs/ojarraydataprovider';

/* ******
This file is not being used because the use-case that was initially identified for this was no longer needed.
However, this is useful functionality and can be used to easily show Toast messages if needed.
***** */

type PropTypes = {
    messageList: Array<MessageToastItem>;
    position: MessageToastIntrinsicProps['position'];
    onClose: MessageToastIntrinsicProps['onojClose'];
};

const ToastMessage = ({ messageList, position, onClose }: PropTypes) => {
    const [toastMessagesList, setToastMessagesList] = useState<Array<MessageToastItem>>(messageList);
    const toastMessagesDP: ArrayDataProvider<string, MessageToastItem> = new ArrayDataProvider<string, MessageToastItem>(toastMessagesList, {
        keyAttributes: 'summary',
    });

    useEffect(() => {
        setToastMessagesList(messageList);
    }, [messageList]);

    return (
        <>
            {toastMessagesDP.isEmpty() === 'no' && (
                <oj-c-message-toast
                    id="generic-toast-messages"
                    position={position}
                    data={toastMessagesDP}
                    onojClose={(e: CustomEvent) => {
                        setToastMessagesList((currentToastMessages) => currentToastMessages.filter((msg) => msg.summary !== e.detail.key));
                        onClose?.(e);
                    }}
                />
            )}
        </>
    );
};

export default ToastMessage;