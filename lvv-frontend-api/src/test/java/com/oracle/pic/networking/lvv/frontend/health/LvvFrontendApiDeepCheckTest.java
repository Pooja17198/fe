package com.oracle.pic.networking.lvv.frontend.health;

import java.io.PrintWriter;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;

class LvvFrontendApiDeepCheckTest {

    @Test
    void execute() {
        LvvFrontendApiDeepCheck check = new LvvFrontendApiDeepCheck();
        PrintWriter output = Mockito.mock(PrintWriter.class);
        check.execute(null, output);
        Mockito.verify(output, Mockito.times(1)).println(Mockito.anyString());
    }
}
